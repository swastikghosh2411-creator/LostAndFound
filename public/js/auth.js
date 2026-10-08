// Handles both the login form and the signup form.
// Whichever form exists on the page gets wired up.

(function () {
  var loginForm = document.getElementById('login-form');
  var signupForm = document.getElementById('signup-form');
  var form = loginForm || signupForm;
  if (!form) return;

  var formError = document.getElementById('form-error');
  var submitBtn = document.getElementById('submit-btn');
  var idleLabel = submitBtn.textContent;

  function setFieldError(name, message) {
    var el = form.querySelector('.field-error[data-for="' + name + '"]');
    if (el) el.textContent = message || '';
    var input = form.elements[name];
    if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function clearErrors() {
    ['name', 'email', 'password', 'confirm'].forEach(function (n) { setFieldError(n, ''); });
    formError.hidden = true;
    formError.textContent = '';
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.hidden = false;
  }

  function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  // Returns true if the form is valid. Focuses the first invalid field.
  function validate(data) {
    var firstInvalid = null;

    function fail(name, message) {
      setFieldError(name, message);
      if (!firstInvalid) firstInvalid = name;
    }

    if (signupForm && data.name.length < 2) fail('name', 'Enter your full name.');
    if (!isEmail(data.email)) fail('email', 'Enter a valid email address.');

    if (signupForm) {
      if (data.password.length < 8) fail('password', 'Password must be at least 8 characters.');
      if (data.confirm !== data.password) fail('confirm', 'Passwords do not match.');
    } else if (!data.password) {
      fail('password', 'Enter your password.');
    }

    if (firstInvalid) form.elements[firstInvalid].focus();
    return !firstInvalid;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();

    var data = {
      name: form.elements.name ? form.elements.name.value.trim() : '',
      email: form.elements.email.value.trim().toLowerCase(),
      password: form.elements.password.value,
      confirm: form.elements.confirm ? form.elements.confirm.value : ''
    };

    if (!validate(data)) return;

    var url = signupForm ? '/api/auth/signup' : '/api/auth/login';
    var body = signupForm
      ? { name: data.name, email: data.email, password: data.password }
      : { email: data.email, password: data.password };

    submitBtn.disabled = true;
    submitBtn.textContent = signupForm ? 'Creating account...' : 'Logging in...';

    fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (json) {
          return { ok: res.ok, json: json };
        });
      })
      .then(function (result) {
        if (result.ok) {
          window.location.href = 'dashboard.html';
          return;
        }
        showFormError(result.json.message || 'Something went wrong. Try again.');
      })
      .catch(function () {
        showFormError('Cannot reach the server. Check your connection and try again.');
      })
      .then(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = idleLabel;
      });
  });
})();
