// Logic for report.html (lost and found share one form).
// Open with report.html?type=lost or report.html?type=found.

(function () {
  var MAX_FILES = 3;
  var MAX_SIZE = 5 * 1024 * 1024;
  var ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

  var form = document.getElementById('report-form');
  var formError = document.getElementById('form-error');
  var submitBtn = document.getElementById('submit-btn');
  var fileInput = document.getElementById('images');
  var previews = document.getElementById('previews');
  var foundOnly = document.querySelector('.found-only');
  var selected = []; // File objects the user has picked

  var TEXT = {
    lost: {
      title: 'Report a lost item',
      sub: 'Describe it as closely as you can. The more detail, the better the match.',
      where: 'Where did you lose it?',
      when: 'When did you lose it?',
      place: 'Library, second floor',
      button: 'Post lost item'
    },
    found: {
      title: 'Report a found item',
      sub: 'Thank you for helping. Say where you found it and where it is now.',
      where: 'Where did you find it?',
      when: 'When did you find it?',
      place: 'Canteen, near the counter',
      button: 'Post found item'
    }
  };

  // ---------- setup ----------
  window.UI.bindLogout();
  window.api.requireAuth().then(init);

  function init() {
    var dateInput = form.elements.date;
    var today = new Date();
    var iso = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');
    dateInput.max = iso;
    dateInput.value = iso;

    var type = new URLSearchParams(window.location.search).get('type');
    setType(type === 'found' ? 'found' : 'lost');

    Array.prototype.forEach.call(form.elements.type, function (radio) {
      radio.addEventListener('change', function () { setType(radio.value); });
    });
    fileInput.addEventListener('change', onFilesPicked);
    form.addEventListener('submit', onSubmit);
  }

  function currentType() { return form.elements.type.value; }

  function setType(type) {
    form.elements.type.value = type;
    var t = TEXT[type];
    document.getElementById('page-title').textContent = t.title;
    document.getElementById('page-sub').textContent = t.sub;
    document.getElementById('location-label').textContent = t.where;
    document.getElementById('date-label').textContent = t.when;
    form.elements.locationText.placeholder = t.place;
    submitBtn.textContent = t.button;
    foundOnly.hidden = type !== 'found';
    document.title = t.title + ' | Lost & Found';
    history.replaceState(null, '', '?type=' + type);
  }

  // ---------- errors ----------
  function setError(name, message) {
    var el = form.querySelector('.field-error[data-for="' + name + '"]');
    if (el) el.textContent = message || '';
    var input = form.elements[name];
    if (input && input.setAttribute) input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function clearErrors() {
    ['title', 'category', 'locationText', 'date', 'verificationAnswer', 'images'].forEach(function (n) { setError(n, ''); });
    formError.hidden = true;
  }

  // ---------- photos ----------
  function onFilesPicked() {
    setError('images', '');
    var problems = [];

    Array.prototype.forEach.call(fileInput.files, function (file) {
      if (selected.length >= MAX_FILES) { problems.push('You can add up to ' + MAX_FILES + ' photos.'); return; }
      if (ALLOWED.indexOf(file.type) === -1) { problems.push(file.name + ' is not a JPG, PNG or WebP image.'); return; }
      if (file.size > MAX_SIZE) { problems.push(file.name + ' is larger than 5 MB.'); return; }
      selected.push(file);
    });

    fileInput.value = ''; // allow picking the same file again
    if (problems.length) setError('images', problems[0]);
    renderPreviews();
  }

  function renderPreviews() {
    previews.innerHTML = '';
    selected.forEach(function (file, index) {
      var img = window.UI.el('img', { alt: 'Selected photo ' + (index + 1) });
      img.src = URL.createObjectURL(file);
      img.onload = function () { URL.revokeObjectURL(img.src); };

      var remove = window.UI.el('button', { type: 'button', class: 'preview-remove', text: 'Remove' });
      remove.setAttribute('aria-label', 'Remove photo ' + (index + 1));
      remove.addEventListener('click', function () {
        selected.splice(index, 1);
        renderPreviews();
      });

      previews.appendChild(window.UI.el('li', {}, [img, remove]));
    });
  }

  // ---------- validation ----------
  function value(name) { return (form.elements[name].value || '').trim(); }

  function validate() {
    var firstInvalid = null;
    function fail(name, message) {
      setError(name, message);
      if (!firstInvalid) firstInvalid = name;
    }

    if (value('title').length < 3) fail('title', 'Enter a short name for the item.');
    if (!value('category')) fail('category', 'Choose a category.');
    if (!value('locationText')) fail('locationText', 'Enter a place.');
    if (!value('date')) fail('date', 'Choose a date.');
    else if (new Date(value('date')) > new Date()) fail('date', 'The date cannot be in the future.');

    if (currentType() === 'found' && value('verificationQuestion') && !value('verificationAnswer')) {
      fail('verificationAnswer', 'Enter the correct answer to your question.');
    }

    if (firstInvalid) form.elements[firstInvalid].focus();
    return !firstInvalid;
  }

  // ---------- submit ----------
  function onSubmit(e) {
    e.preventDefault();
    clearErrors();
    if (!validate()) return;

    var type = currentType();
    var data = new FormData();
    var fields = ['title', 'category', 'color', 'brand', 'description', 'locationText', 'date', 'latitude', 'longitude'];
    if (type === 'found') fields = fields.concat(['keptAt', 'verificationQuestion', 'verificationAnswer']);

    data.append('type', type);
    fields.forEach(function (name) {
      var v = value(name);
      if (v) data.append(name, v); // empty optional fields are not sent
    });
    selected.forEach(function (file) { data.append('images', file); });

    submitBtn.disabled = true;
    var label = submitBtn.textContent;
    submitBtn.textContent = 'Posting...';

    window.api.createItem(data)
      .then(function () {
        window.location.href = 'dashboard.html?posted=' + type;
      })
      .catch(function (err) {
        window.UI.showMessage(formError, err.message, 'error');
        formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        submitBtn.disabled = false;
        submitBtn.textContent = label;
      });
  }
})();
