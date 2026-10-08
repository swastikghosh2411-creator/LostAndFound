/*
 * api.js - the only place that talks to the server.
 * Every page loads this first. If an endpoint or field name changes,
 * change it here and nowhere else.
 *
 * BACKEND CONTRACT (build the server to match this)
 * ------------------------------------------------------------------
 * GET    /api/auth/me            -> { _id, name, email }          (401 if not logged in)
 * POST   /api/auth/logout        -> { message }
 *
 * POST   /api/items              multipart/form-data
 *        fields: type ("lost" | "found"), title, category, color, brand,
 *                description, locationText, date (YYYY-MM-DD),
 *                latitude, longitude (optional, only sent if set),
 *                found only: keptAt, verificationQuestion, verificationAnswer
 *        files:  images (0 to 3 files, jpg/png/webp, max 5 MB each)
 *        -> { item: {...} }
 *
 * GET    /api/items/mine         -> { items: [Item] }             (only the logged-in user's)
 * PATCH  /api/items/:id          body { status } -> { item }
 * DELETE /api/items/:id          -> { message }
 * GET    /api/matches            -> { matches: [Match] }          (matches for the user's items)
 *
 * PUBLIC (no login needed)
 * GET    /api/items/found?q=&category=&page=&limit=
 *        -> { items: [Item], total, page, pages }   (only active found items, no contact info)
 *
 * ITEM DETAILS
 * GET    /api/items/:id?match=<matchId>   (match is optional)
 *        -> { item, isOwner, myClaim, claims, match }
 *        item gets two extra fields: verificationQuestion (string or null, NEVER the answer)
 *        and contact ({ name, email } or null). contact is only filled when the viewer
 *        owns the item or has an approved claim.
 *        myClaim: the logged-in viewer's Claim on this item, or null
 *        claims:  all Claims on the item, only when isOwner is true, else []
 *        match:   { _id, score, reasons, myItem } when ?match= is valid for the viewer, else null
 * POST   /api/items/:id/claim     body { answer, message }
 *        -> { claim, contact }   contact is set only if claim.status is "approved".
 *        If the item has a verificationQuestion, the server checks the answer
 *        (trimmed, case-insensitive) and approves or answers 400 { message }.
 *        If it has none, the claim is saved as "pending" for the finder to review.
 * PATCH  /api/claims/:id          body { status: "approved" | "rejected" } (item owner only)
 *        -> { claim }  (an approved claim includes claimant.email)
 *
 * Claim = { _id, status ("pending" | "approved" | "rejected"), message,
 *           claimant: { name, email? }, createdAt }
 *
 * Item  = { _id, type, title, category, color, brand, description,
 *           locationText, date, status, images: [url], createdAt }
 *         status is one of: "active", "matched", "returned", "closed"
 * Match = { _id, score (0 to 100), reasons: [string],
 *           myItem: Item, otherItem: Item, status }
 *
 * Errors: any non-2xx response must return { message: "..." }.
 * ------------------------------------------------------------------
 */

(function () {
  var BASE = '/api';

  function request(path, options) {
    options = options || {};
    var init = {
      method: options.method || 'GET',
      credentials: 'include',
      headers: {}
    };

    if (options.body instanceof FormData) {
      init.body = options.body; // browser sets the multipart header itself
    } else if (options.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }

    return fetch(BASE + path, init).then(
      function (res) {
        return res.json().catch(function () { return {}; }).then(function (json) {
          if (res.status === 401 && !options.noRedirect) {
            window.location.href = 'login.html';
            throw new Error('Please log in.');
          }
          if (!res.ok) throw new Error(json.message || 'Something went wrong. Try again.');
          return json;
        });
      },
      function () {
        throw new Error('Cannot reach the server. Check your connection and try again.');
      }
    );
  }

  window.api = {
    me: function () {
      return request('/auth/me', { noRedirect: true }).then(function (json) { return json.user || json; });
    },
    logout: function () { return request('/auth/logout', { method: 'POST', noRedirect: true }); },
    createItem: function (formData) { return request('/items', { method: 'POST', body: formData }); },
    myItems: function () { return request('/items/mine').then(function (j) { return j.items || []; }); },
    updateItem: function (id, data) { return request('/items/' + encodeURIComponent(id), { method: 'PATCH', body: data }); },
    deleteItem: function (id) { return request('/items/' + encodeURIComponent(id), { method: 'DELETE' }); },
    myMatches: function () { return request('/matches').then(function (j) { return j.matches || []; }); },

    // Public list of found items. params: { q, category, page, limit }
    foundItems: function (params) {
      var query = new URLSearchParams();
      Object.keys(params || {}).forEach(function (k) { if (params[k]) query.set(k, params[k]); });
      var qs = query.toString();
      return request('/items/found' + (qs ? '?' + qs : ''), { noRedirect: true });
    },
    item: function (id, matchId) {
      var qs = matchId ? '?match=' + encodeURIComponent(matchId) : '';
      return request('/items/' + encodeURIComponent(id) + qs, { noRedirect: true });
    },
    claim: function (id, data) {
      return request('/items/' + encodeURIComponent(id) + '/claim', { method: 'POST', body: data });
    },
    updateClaim: function (claimId, status) {
      return request('/claims/' + encodeURIComponent(claimId), { method: 'PATCH', body: { status: status } });
    },

    // Call at the top of any page that needs a logged-in user.
    requireAuth: function () {
      return window.api.me().catch(function () {
        window.location.href = 'login.html';
        return new Promise(function () {}); // stop the page script while redirecting
      });
    }
  };

  /* Small helpers shared by the pages */
  window.UI = {
    // el('div', { class: 'x', text: 'hi' }, [child, child])
    el: function (tag, attrs, children) {
      var node = document.createElement(tag);
      Object.keys(attrs || {}).forEach(function (key) {
        if (key === 'text') node.textContent = attrs[key];
        else node.setAttribute(key, attrs[key]);
      });
      (children || []).forEach(function (child) {
        if (child) node.appendChild(child);
      });
      return node;
    },

    id: function (obj) { return obj._id || obj.id; },

    formatDate: function (value) {
      if (!value) return '';
      var d = new Date(value);
      if (isNaN(d)) return '';
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    },

    statusLabel: function (status) {
      return { active: 'Active', matched: 'Match found', returned: 'Returned', closed: 'Closed' }[status] || 'Active';
    },

    showMessage: function (box, message, kind) {
      box.textContent = message;
      box.className = 'banner banner-' + (kind || 'info');
      box.hidden = false;
    },

    // For pages anyone can open. Fills the nav for logged-in or logged-out
    // visitors and resolves with the user object, or null if logged out.
    renderNav: function (nav) {
      var el = window.UI.el;
      return window.api.me().then(
        function (user) { return user; },
        function () { return null; }
      ).then(function (user) {
        nav.innerHTML = '';
        nav.appendChild(el('a', { href: 'browse.html', text: 'Browse found items' }));
        if (user) {
          nav.appendChild(el('a', { href: 'dashboard.html', text: 'Dashboard' }));
          nav.appendChild(el('a', { class: 'btn btn-small', href: '#', 'data-logout': '', text: 'Log out' }));
        } else {
          nav.appendChild(el('a', { href: 'login.html', text: 'Log in' }));
          nav.appendChild(el('a', { class: 'btn btn-small', href: 'signup.html', text: 'Sign up' }));
        }
        window.UI.bindLogout();
        return user;
      });
    },

    // Wires every [data-logout] link on the page.
    bindLogout: function () {
      Array.prototype.forEach.call(document.querySelectorAll('[data-logout]'), function (link) {
        link.addEventListener('click', function (e) {
          e.preventDefault();
          window.api.logout().then(function () { window.location.href = 'index.html'; })
            .catch(function () { window.location.href = 'index.html'; });
        });
      });
    }
  };
})();
