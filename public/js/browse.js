// Logic for browse.html: public list of found items with search and category filter.

(function () {
  var el = window.UI.el;
  var form = document.getElementById('filters');
  var grid = document.getElementById('grid');
  var count = document.getElementById('count');
  var moreBtn = document.getElementById('more');
  var message = document.getElementById('message');
  var PAGE_SIZE = 12;
  var state = { page: 1, pages: 1, loading: false };

  window.UI.renderNav(document.getElementById('nav-links'));

  // Start from the URL, so a search can be shared or refreshed.
  var params = new URLSearchParams(window.location.search);
  form.elements.q.value = params.get('q') || '';
  form.elements.category.value = params.get('category') || '';

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var query = new URLSearchParams();
    if (form.elements.q.value.trim()) query.set('q', form.elements.q.value.trim());
    if (form.elements.category.value) query.set('category', form.elements.category.value);
    var qs = query.toString();
    history.replaceState(null, '', qs ? '?' + qs : 'browse.html');
    load(true);
  });

  moreBtn.addEventListener('click', function () { load(false); });

  function card(item) {
    var url = item.images && item.images[0];
    var photo = url
      ? el('img', { src: url, alt: '', loading: 'lazy' })
      : el('div', { class: 'found-photo-empty', text: 'No photo' });

    var link = el('a', { href: 'item-details.html?id=' + encodeURIComponent(window.UI.id(item)) }, [
      el('div', { class: 'found-photo' }, [photo]),
      el('h2', { text: item.title }),
      el('p', { text: item.category + (item.color ? ', ' + item.color : '') }),
      el('p', { text: (item.locationText || 'Unknown place') + ', ' + window.UI.formatDate(item.date) })
    ]);
    return el('li', { class: 'found-item' }, [link]);
  }

  function load(reset) {
    if (state.loading) return;
    state.loading = true;
    message.hidden = true;
    moreBtn.disabled = true;

    if (reset) {
      state.page = 1;
      grid.innerHTML = '';
      count.textContent = 'Loading...';
    } else {
      state.page += 1;
    }

    window.api.foundItems({
      q: form.elements.q.value.trim(),
      category: form.elements.category.value,
      page: state.page,
      limit: PAGE_SIZE
    })
      .then(function (res) {
        var items = res.items || [];
        state.pages = res.pages || 1;
        items.forEach(function (item) { grid.appendChild(card(item)); });

        var total = typeof res.total === 'number' ? res.total : grid.children.length;
        count.textContent = total === 0
          ? 'No found items match your search.'
          : total + (total === 1 ? ' found item' : ' found items');
        moreBtn.hidden = state.page >= state.pages;
      })
      .catch(function (err) {
        count.textContent = '';
        if (!reset) state.page -= 1;
        window.UI.showMessage(message, err.message, 'error');
      })
      .then(function () {
        state.loading = false;
        moreBtn.disabled = false;
      });
  }

  load(true);
})();
