// Logic for dashboard.html: my matches, my lost items, my found items.

(function () {
  var el = window.UI.el;
  var itemId = window.UI.id;
  var banner = document.getElementById('banner');
  var state = { items: [], matches: [] };

  window.UI.bindLogout();

  window.api.requireAuth().then(function (user) {
    var first = (user.name || '').split(' ')[0];
    document.getElementById('greeting').textContent = first ? 'Hello, ' + first : 'Your dashboard';
    showPostedMessage();
    setupTabs();
    load();
  });

  function showPostedMessage() {
    var posted = new URLSearchParams(window.location.search).get('posted');
    if (!posted) return;
    window.UI.showMessage(
      banner,
      posted === 'found'
        ? 'Your found item is posted. If it matches a lost report, the owner will be notified.'
        : 'Your lost item is posted. We will tell you if a matching item turns up.',
      'success'
    );
    history.replaceState(null, '', 'dashboard.html');
  }

  function load() {
    Promise.all([window.api.myItems(), window.api.myMatches()])
      .then(function (results) {
        state.items = results[0];
        state.matches = results[1];
        render();
      })
      .catch(function (err) {
        window.UI.showMessage(banner, err.message, 'error');
      });
  }

  // ---------- tabs ----------
  function setupTabs() {
    var tabs = document.querySelectorAll('.tab');
    Array.prototype.forEach.call(tabs, function (tab) {
      tab.addEventListener('click', function () {
        Array.prototype.forEach.call(tabs, function (t) {
          var active = t === tab;
          t.setAttribute('aria-selected', active ? 'true' : 'false');
          document.getElementById('panel-' + t.dataset.panel).hidden = !active;
        });
      });
    });
  }

  // ---------- rendering ----------
  function itemsOfType(type) {
    return state.items.filter(function (i) { return i.type === type; });
  }

  function render() {
    var lost = itemsOfType('lost');
    var found = itemsOfType('found');

    document.getElementById('tab-matches').textContent = 'Matches (' + state.matches.length + ')';
    document.getElementById('tab-lost').textContent = 'My lost items (' + lost.length + ')';
    document.getElementById('tab-found').textContent = 'My found items (' + found.length + ')';

    renderMatches(document.getElementById('panel-matches'));
    renderItems(document.getElementById('panel-lost'), lost, 'lost');
    renderItems(document.getElementById('panel-found'), found, 'found');
  }

  function empty(message, linkText, href) {
    var box = el('div', { class: 'empty' }, [el('p', { text: message })]);
    if (href) box.appendChild(el('a', { class: 'btn btn-small', href: href, text: linkText }));
    return box;
  }

  function thumb(item) {
    var url = item.images && item.images[0];
    if (url) return el('img', { class: 'thumb', src: url, alt: '' });
    return el('div', { class: 'thumb thumb-empty', text: 'No photo' });
  }

  function renderMatches(panel) {
    panel.innerHTML = '';
    if (!state.matches.length) {
      panel.appendChild(empty(
        'No matches yet. When a lost item and a found item look alike, they will show up here.',
        'Report an item', 'report.html'
      ));
      return;
    }

    var list = el('ul', { class: 'rows' });
    state.matches.forEach(function (match) {
      var mine = match.myItem || {};
      var other = match.otherItem || {};
      var otherLabel = other.type === 'found' ? 'Found' : 'Lost';

      var info = el('div', { class: 'row-info' }, [
        el('strong', { text: other.title || 'Item' }),
        el('span', { text: 'Matches your ' + (mine.type || '') + ' item: ' + (mine.title || '') }),
        el('span', { text: otherLabel + ' at ' + (other.locationText || 'unknown place') + ', ' + window.UI.formatDate(other.date) })
      ]);
      if (match.reasons && match.reasons.length) {
        info.appendChild(el('span', { class: 'row-reasons', text: match.reasons.join(', ') }));
      }

      list.appendChild(el('li', { class: 'row' }, [
        thumb(other),
        info,
        el('span', { class: 'score', text: Math.round(match.score) + '% match' }),
        el('div', { class: 'row-actions' }, [
          el('a', {
            class: 'btn btn-small',
            href: 'item-details.html?id=' + encodeURIComponent(itemId(other)) + '&match=' + encodeURIComponent(itemId(match)),
            text: 'View match'
          })
        ])
      ]));
    });
    panel.appendChild(list);
  }

  function renderItems(panel, items, type) {
    panel.innerHTML = '';
    if (!items.length) {
      panel.appendChild(empty(
        type === 'lost' ? 'You have not reported anything lost.' : 'You have not reported anything found.',
        type === 'lost' ? 'Report a lost item' : 'Report a found item',
        'report.html?type=' + type
      ));
      return;
    }

    var list = el('ul', { class: 'rows' });
    items.forEach(function (item) {
      var open = item.status !== 'returned' && item.status !== 'closed';

      var actions = el('div', { class: 'row-actions' }, [
        el('a', { class: 'btn btn-small btn-outline', href: 'item-details.html?id=' + encodeURIComponent(itemId(item)), text: 'View' })
      ]);

      if (open) {
        var done = el('button', { type: 'button', class: 'link-button', text: 'Mark as returned' });
        done.addEventListener('click', function () { markReturned(item); });
        actions.appendChild(done);
      }
      var del = el('button', { type: 'button', class: 'link-button link-danger', text: 'Delete' });
      del.addEventListener('click', function () { remove(item); });
      actions.appendChild(del);

      list.appendChild(el('li', { class: 'row' }, [
        thumb(item),
        el('div', { class: 'row-info' }, [
          el('strong', { text: item.title }),
          el('span', { text: item.category + (item.color ? ', ' + item.color : '') }),
          el('span', { text: (item.locationText || '') + ', ' + window.UI.formatDate(item.date) })
        ]),
        el('span', { class: 'badge badge-' + (item.status || 'active'), text: window.UI.statusLabel(item.status) }),
        actions
      ]));
    });
    panel.appendChild(list);
  }

  // ---------- actions ----------
  function markReturned(item) {
    window.api.updateItem(itemId(item), { status: 'returned' })
      .then(function () {
        item.status = 'returned';
        render();
        window.UI.showMessage(banner, 'Marked as returned.', 'success');
      })
      .catch(function (err) { window.UI.showMessage(banner, err.message, 'error'); });
  }

  function remove(item) {
    if (!window.confirm('Delete "' + item.title + '"? This cannot be undone.')) return;
    window.api.deleteItem(itemId(item))
      .then(function () {
        state.items = state.items.filter(function (i) { return itemId(i) !== itemId(item); });
        state.matches = state.matches.filter(function (m) { return itemId(m.myItem || {}) !== itemId(item); });
        render();
        window.UI.showMessage(banner, 'Item deleted.', 'success');
      })
      .catch(function (err) { window.UI.showMessage(banner, err.message, 'error'); });
  }
})();
