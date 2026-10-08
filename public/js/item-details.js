// Logic for item-details.html.
// Open with item-details.html?id=<itemId>  (optionally &match=<matchId>)

(function () {
  var el = window.UI.el;
  var params = new URLSearchParams(window.location.search);
  var id = params.get('id');
  var matchId = params.get('match');
  var root = document.getElementById('item-root');
  var matchBanner = document.getElementById('match-banner');

  if (!id) {
    root.innerHTML = '';
    root.appendChild(el('p', { class: 'banner banner-error', text: 'No item was selected.' }));
    return;
  }

  window.UI.renderNav(document.getElementById('nav-links')).then(function (user) {
    window.api.item(id, matchId)
      .then(function (data) { render(data, user); })
      .catch(function (err) {
        root.innerHTML = '';
        root.appendChild(el('p', { class: 'banner banner-error', text: err.message }));
      });
  });

  // ---------- page ----------
  function render(data, user) {
    var item = data.item;
    document.title = item.title + ' | Lost & Found';
    root.innerHTML = '';

    if (data.match) {
      var mine = data.match.myItem || {};
      var text = 'This was matched with your ' + (mine.type || '') + ' item "' + (mine.title || '') + '" (' +
        Math.round(data.match.score) + '% match).';
      if (data.match.reasons && data.match.reasons.length) text += ' ' + data.match.reasons.join(', ') + '.';
      window.UI.showMessage(matchBanner, text, 'success');
    }

    var panel = el('div', { class: 'panel', id: 'panel' });
    root.appendChild(el('div', { class: 'detail' }, [
      gallery(item),
      el('div', { class: 'detail-main' }, [info(item), panel])
    ]));
    renderPanel(panel, data, user);
  }

  function gallery(item) {
    var images = item.images || [];
    var box = el('div', { class: 'gallery' });
    if (!images.length) {
      box.appendChild(el('div', { class: 'gallery-empty', text: 'No photo provided' }));
      return box;
    }

    var main = el('img', { class: 'gallery-main', src: images[0], alt: item.title });
    box.appendChild(main);

    if (images.length > 1) {
      var thumbs = el('div', { class: 'gallery-thumbs' });
      images.forEach(function (url, i) {
        var btn = el('button', { type: 'button', 'aria-label': 'Show photo ' + (i + 1) }, [
          el('img', { src: url, alt: '' })
        ]);
        btn.addEventListener('click', function () { main.src = url; });
        thumbs.appendChild(btn);
      });
      box.appendChild(thumbs);
    }
    return box;
  }

  function info(item) {
    var facts = el('dl', { class: 'facts' });
    function add(label, value) {
      if (!value) return;
      facts.appendChild(el('dt', { text: label }));
      facts.appendChild(el('dd', { text: value }));
    }
    var isFound = item.type === 'found';
    add('Category', item.category);
    add('Color', item.color);
    add('Brand', item.brand);
    add(isFound ? 'Found at' : 'Lost at', item.locationText);
    add(isFound ? 'Found on' : 'Lost on', window.UI.formatDate(item.date));
    if (isFound) add('Kept at', item.keptAt);
    add('Posted by', item.poster && item.poster.name);

    var wrap = el('div', {}, [
      el('p', { class: 'detail-type', text: isFound ? 'Found item' : 'Lost item' }),
      el('h1', { text: item.title }),
      el('span', { class: 'badge badge-' + (item.status || 'active'), text: window.UI.statusLabel(item.status) }),
      facts
    ]);
    if (item.description) wrap.appendChild(el('p', { class: 'detail-desc', text: item.description }));
    return wrap;
  }

  // ---------- action panel (changes with who is looking) ----------
  function renderPanel(panel, data, user) {
    var item = data.item;
    panel.innerHTML = '';
    var closed = item.status === 'returned' || item.status === 'closed';

    if (data.isOwner) return ownerPanel(panel, data, closed);

    if (closed) {
      panel.appendChild(el('h2', { text: 'This item is no longer available' }));
      panel.appendChild(el('p', { text: 'It has been marked as ' + window.UI.statusLabel(item.status).toLowerCase() + '.' }));
      return;
    }

    if (item.type === 'lost') {
      panel.appendChild(el('h2', { text: 'Did you find this?' }));
      panel.appendChild(el('p', { text: 'Post it as a found item and the owner will be told if it matches.' }));
      panel.appendChild(el('a', { class: 'btn', href: 'report.html?type=found', text: 'Post a found item' }));
      return;
    }

    if (!user) {
      panel.appendChild(el('h2', { text: 'Is this yours?' }));
      panel.appendChild(el('p', { text: 'Log in to claim it. You may be asked a question only the owner can answer.' }));
      panel.appendChild(el('a', { class: 'btn', href: 'login.html', text: 'Log in to claim' }));
      return;
    }

    if (data.myClaim) return claimStatusPanel(panel, data);
    claimFormPanel(panel, data, user);
  }

  function contactBlock(contact) {
    var box = el('div', { class: 'contact' }, [
      el('p', { text: 'Contact the finder to arrange the handover.' }),
      el('strong', { text: contact.name || '' }),
      el('span', { text: contact.email || '' })
    ]);
    box.appendChild(el('p', { class: 'notice', text: 'Meet in a public place, or collect it from the security office or front desk.' }));
    return box;
  }

  function claimStatusPanel(panel, data) {
    var claim = data.myClaim;
    panel.appendChild(el('h2', { text: 'Your claim' }));
    panel.appendChild(el('span', { class: 'badge badge-' + claim.status, text: claimLabel(claim.status) }));

    if (claim.status === 'approved' && data.item.contact) {
      panel.appendChild(contactBlock(data.item.contact));
    } else if (claim.status === 'pending') {
      panel.appendChild(el('p', { text: 'The finder will review your claim. You will see their contact details here once it is approved.' }));
    } else {
      panel.appendChild(el('p', { text: 'Your claim was not accepted.' }));
    }
  }

  function claimFormPanel(panel, data) {
    var item = data.item;
    var question = item.verificationQuestion;

    panel.appendChild(el('h2', { text: 'Is this yours?' }));
    panel.appendChild(el('p', {
      text: question
        ? 'Answer the finder\'s question to prove it is yours. Contact details are shown once you answer correctly.'
        : 'Tell the finder how you can prove it is yours. They will review your claim.'
    }));

    var error = el('p', { class: 'banner banner-error', role: 'alert', hidden: '' });
    var form = el('form', { novalidate: '' });
    form.appendChild(error);

    var answer;
    if (question) {
      answer = el('input', { type: 'text', id: 'answer', maxlength: '150', required: '' });
      form.appendChild(el('div', { class: 'field' }, [el('label', { for: 'answer', text: question }), answer]));
    }

    var message = el('textarea', { id: 'message', rows: '3', maxlength: '400',
      placeholder: 'Marks, contents, when you lost it' });
    form.appendChild(el('div', { class: 'field' }, [
      el('label', { for: 'message', text: question ? 'Anything else to add (optional)' : 'How can you prove it is yours?' }),
      message
    ]));

    var submit = el('button', { type: 'submit', class: 'btn', text: 'Claim this item' });
    form.appendChild(submit);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      error.hidden = true;

      if (question && !answer.value.trim()) {
        window.UI.showMessage(error, 'Enter an answer to the question.', 'error');
        answer.focus();
        return;
      }
      if (!question && message.value.trim().length < 10) {
        window.UI.showMessage(error, 'Describe how you can prove it is yours (at least 10 characters).', 'error');
        message.focus();
        return;
      }

      submit.disabled = true;
      submit.textContent = 'Sending...';
      window.api.claim(window.UI.id(item), {
        answer: answer ? answer.value.trim() : '',
        message: message.value.trim()
      })
        .then(function (res) {
          data.myClaim = res.claim;
          if (res.contact) data.item.contact = res.contact;
          renderPanel(panel, data, { loggedIn: true });
        })
        .catch(function (err) {
          window.UI.showMessage(error, err.message, 'error');
          submit.disabled = false;
          submit.textContent = 'Claim this item';
        });
    });

    panel.appendChild(form);
  }

  function ownerPanel(panel, data, closed) {
    var claims = data.claims || [];
    panel.appendChild(el('h2', { text: 'This is your post' }));
    panel.appendChild(el('p', { text: closed
      ? 'It is marked as ' + window.UI.statusLabel(data.item.status).toLowerCase() + '.'
      : 'You can manage it from your dashboard.' }));
    panel.appendChild(el('a', { class: 'btn btn-outline btn-small', href: 'dashboard.html', text: 'Go to dashboard' }));

    if (data.item.type !== 'found') return;

    panel.appendChild(el('h3', { class: 'panel-sub', text: 'Claims (' + claims.length + ')' }));
    if (!claims.length) {
      panel.appendChild(el('p', { text: 'Nobody has claimed this yet.' }));
      return;
    }

    var list = el('ul', { class: 'claims' });
    claims.forEach(function (claim) {
      var row = el('li', { class: 'claim' });
      renderClaim(row, claim);
      list.appendChild(row);
    });
    panel.appendChild(list);
  }

  function renderClaim(row, claim) {
    row.innerHTML = '';
    var who = (claim.claimant && claim.claimant.name) || 'Someone';
    row.appendChild(el('div', { class: 'claim-head' }, [
      el('strong', { text: who }),
      el('span', { class: 'badge badge-' + claim.status, text: claimLabel(claim.status) })
    ]));
    if (claim.message) row.appendChild(el('p', { text: claim.message }));

    if (claim.status === 'approved' && claim.claimant && claim.claimant.email) {
      row.appendChild(el('p', { text: 'Contact: ' + claim.claimant.email }));
    }

    if (claim.status === 'pending') {
      var actions = el('div', { class: 'row-actions' });
      [['approved', 'Approve', 'btn btn-small'], ['rejected', 'Reject', 'btn btn-small btn-outline']].forEach(function (a) {
        var btn = el('button', { type: 'button', class: a[2], text: a[1] });
        btn.addEventListener('click', function () {
          btn.disabled = true;
          window.api.updateClaim(window.UI.id(claim), a[0])
            .then(function (res) { renderClaim(row, res.claim || claim); })
            .catch(function (err) { btn.disabled = false; window.alert(err.message); });
        });
        actions.appendChild(btn);
      });
      row.appendChild(actions);
    }
  }

  function claimLabel(status) {
    return { pending: 'Waiting for review', approved: 'Approved', rejected: 'Not accepted' }[status] || status;
  }
})();
