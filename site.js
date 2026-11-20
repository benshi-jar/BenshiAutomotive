(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  function select(tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
  }
  tabs.forEach(function (t) { t.addEventListener('click', function () { select(t); }); });

  var joinForm = document.getElementById('join-form');
  if (!joinForm) { return; }
  var joinStatus = document.getElementById('join-status');
  joinForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var button = joinForm.querySelector('button[type="submit"]');
    var isFeedback = !!joinForm.querySelector('textarea');
    function say(text, isError) {
      joinStatus.textContent = text;
      joinStatus.classList.toggle('error', !!isError);
    }
    var filled = Array.prototype.some.call(joinForm.querySelectorAll('textarea, input[type="email"]'), function (f) { return f.value.trim(); });
    if (!filled) { say(isFeedback ? 'Write a note or leave your email first.' : 'Enter your email first.', true); return; }
    button.disabled = true;
    say(isFeedback ? 'Sending.' : 'Adding you to the list.');
    fetch(joinForm.action, {
      method: 'POST',
      body: new FormData(joinForm),
      headers: { Accept: 'application/json' }
    }).then(function (res) {
      if (!res.ok) { throw new Error('Request failed'); }
      joinForm.reset();
      say(isFeedback ? 'Thanks. Every note gets read.' : 'You are on the list. We will email you when we add more makes.');
    }).catch(function () {
      say('That did not go through. Check the address and try again in a minute.', true);
    }).then(function () {
      button.disabled = false;
    });
  });
})();
