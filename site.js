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

  var checkForm = document.getElementById('check-form');
  if (checkForm) checkForm.addEventListener('submit', function (e) {
    e.preventDefault();
    document.getElementById('sample').scrollIntoView({ behavior: 'smooth' });
  });
  var joinForm = document.getElementById('join-form');
  if (!joinForm) { return; }
  var joinStatus = document.getElementById('join-status');
  joinForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var button = joinForm.querySelector('button');
    function say(text, isError) {
      joinStatus.textContent = text;
      joinStatus.classList.toggle('error', !!isError);
    }
    button.disabled = true;
    say('Adding you to the list.');
    fetch(joinForm.action, {
      method: 'POST',
      body: new FormData(joinForm),
      headers: { Accept: 'application/json' }
    }).then(function (res) {
      if (!res.ok) { throw new Error('Request failed'); }
      joinForm.reset();
      say('You are on the list. We will email you when Walkaround opens.');
    }).catch(function () {
      say('That did not go through. Check the address and try again in a minute.', true);
    }).then(function () {
      button.disabled = false;
    });
  });
})();
