// Walkaround background worker. The page script finds the car on a listing
// and asks this worker for a report, because only the extension (not the
// listing site) is allowed to call the Walkaround API.
self.WALKAROUND_SITE = 'https://benshiautomotive.vercel.app';

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== 'walkaround-report') return false;
  var params = new URLSearchParams();
  ['vin', 'year', 'model', 'miles', 'price'].forEach(function (key) {
    var value = msg.query && msg.query[key];
    if (value !== null && value !== undefined && value !== '') params.set(key, value);
  });
  fetch(self.WALKAROUND_SITE + '/api/report?' + params.toString())
    .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
    .then(sendResponse, function () { sendResponse({ ok: false, body: { error: 'network' } }); });
  return true; // the answer comes back later
});

// Clicking the toolbar icon shows the panel again on a listing, or opens the
// checker anywhere else.
chrome.action.onClicked.addListener(function (tab) {
  var openSite = function () { chrome.tabs.create({ url: self.WALKAROUND_SITE + '/check' }); };
  if (!tab || !tab.id) return openSite();
  chrome.tabs.sendMessage(tab.id, { type: 'walkaround-show' }).then(function (reply) {
    if (!reply || !reply.shown) openSite();
  }, openSite);
});
