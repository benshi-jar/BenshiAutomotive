// Walkaround on listing pages. Finds a used BMW on the page (VIN, year, model,
// mileage, price), asks the Walkaround API for a short report through the
// background worker, and shows it in a small panel in the corner.
// Only those five values leave the page. The page text itself is never sent.
(function () {
  'use strict';
  if (window.__walkaround) return;
  window.__walkaround = true;

  var DETAIL_PAGES = [
    /cargurus\.com\/(details\/\d+|.*#listing=\d+)/i,
    /cars\.com\/vehicledetail\//i,
    /autotrader\.com\/cars-for-sale\/(vehicle\/\d+|vehicledetails)/i,
    /carmax\.com\/car\/\d+/i,
    /carvana\.com\/vehicle\/\d+/i,
    /truecar\.com\/used-cars-for-sale\/listing\//i,
    /facebook\.com\/marketplace\/item\/\d+/i,
    /craigslist\.org\/.*\/(cto|ctd)\/d\//i
  ];
  var BMW_WMI = /^(WBA|WBS|WBY|WBX|5UX|5UJ|5YM|4US)/;

  var host = null, root = null;
  var view = { state: 'hidden', got: null, data: null, minimized: false, closed: false };
  var lastKey = '';
  var lastUrl = location.href;
  var pending = null;

  function isDetailPage() {
    return DETAIL_PAGES.some(function (re) { return re.test(location.href); });
  }

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function miles(n) { return Math.round(n).toLocaleString('en-US'); }

  // Read the listing. The heading and tab title go first so the car's own
  // name wins over any "similar cars" further down the page.
  function readListing() {
    var h1 = document.querySelector('h1');
    var head = (h1 ? h1.innerText : '') + '\n' + document.title;
    var body = document.body ? document.body.innerText.slice(0, 120000) : '';
    var got = window.WalkaroundParse.parseListing(head + '\n' + body);
    var bmw = got.vin ? BMW_WMI.test(got.vin) : (/\bBMW\b/i.test(head) && !!(got.year && got.model));
    return bmw ? got : null;
  }

  function scan() {
    pending = null;
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      lastKey = '';
      view.closed = false;
    }
    if (!isDetailPage()) { setView('hidden'); return; }
    var got = readListing();
    if (!got) { setView('hidden'); return; }
    var key = [got.vin, got.year, got.model, got.miles, got.price].join('|');
    if (key === lastKey) return;
    lastKey = key;
    view.got = got;
    setView('loading');
    request(got);
  }

  function request(got) {
    chrome.runtime.sendMessage({
      type: 'walkaround-report',
      query: { vin: got.vin, year: got.vin ? '' : got.year, model: got.vin ? '' : got.model, miles: got.miles, price: got.price }
    }, function (reply) {
      if (chrome.runtime.lastError || !reply) { setView('error'); return; }
      var body = reply.body || {};
      if (body.status === 'not-bmw' || body.status === 'need-model' || body.status === 'bad-input') { setView('hidden'); return; }
      if (!reply.ok) { setView('error'); return; }
      view.data = body;
      setView(body.status === 'ok' ? 'ok' : 'pick');
    });
  }

  function schedule() {
    if (!pending) pending = setTimeout(scan, 1200);
  }

  function setView(state) {
    view.state = state;
    render();
  }

  // ---- panel ----

  var CSS = [
    ':host { all: initial; }',
    '.wrap { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #eef2ff; }',
    '.panel { width: 320px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px); overflow: auto; border-radius: 20px; padding: 16px; box-sizing: border-box;',
    '  background: linear-gradient(160deg, rgba(20,30,64,0.97), rgba(10,16,38,0.97)); border: 1px solid rgba(255,255,255,0.12);',
    '  box-shadow: 0 18px 50px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08); animation: rise 0.35s ease-out; }',
    '@keyframes rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }',
    '.top { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }',
    '.logo { width: 22px; height: 22px; flex: none; display: block; }',
    '.brand { font-weight: 800; letter-spacing: 0.01em; flex: 1; background: linear-gradient(90deg,#7dd3fc,#a78bfa,#fb7185); -webkit-background-clip: text; background-clip: text; color: transparent; }',
    '.icon { all: unset; cursor: pointer; width: 26px; height: 26px; border-radius: 9px; display: grid; place-items: center; color: #b8c2e0; font-size: 16px; }',
    '.icon:hover, .icon:focus-visible { background: rgba(255,255,255,0.1); color: #fff; }',
    '.car { font-weight: 700; font-size: 15px; margin: 0 0 2px; }',
    '.sub { color: #a9b4d6; font-size: 12.5px; margin: 0 0 10px; }',
    '.pill { display: inline-block; font-weight: 700; font-size: 12.5px; padding: 4px 10px; border-radius: 999px; margin-bottom: 6px; }',
    '.pill.bad { background: rgba(251,113,133,0.18); color: #fda4af; }',
    '.pill.mid { background: rgba(251,191,36,0.16); color: #fcd34d; }',
    '.pill.live { background: rgba(52,211,153,0.16); color: #6ee7b7; }',
    '.verdict { color: #d5dcf2; font-size: 13px; margin: 0 0 12px; }',
    '.offer { display: flex; align-items: baseline; gap: 10px; padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,0.06); margin-bottom: 10px; }',
    '.offer b { font-size: 22px; background: linear-gradient(90deg,#7dd3fc,#a78bfa); -webkit-background-clip: text; background-clip: text; color: transparent; }',
    '.offer s { color: #8f9bc0; }',
    '.offer span { color: #a9b4d6; font-size: 12px; margin-left: auto; }',
    '.label { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.06em; color: #8f9bc0; margin: 10px 0 4px; }',
    'ul { list-style: none; margin: 0; padding: 0; }',
    'li { display: flex; gap: 8px; justify-content: space-between; padding: 5px 0; border-top: 1px solid rgba(255,255,255,0.07); font-size: 13px; }',
    'li:first-child { border-top: 0; }',
    'li em { font-style: normal; color: #a9b4d6; white-space: nowrap; }',
    '.note { font-size: 12.5px; color: #c4cce6; margin: 8px 0 0; }',
    '.btn { display: block; text-align: center; margin-top: 14px; padding: 11px 14px; border-radius: 999px; font-weight: 700; text-decoration: none; color: #0b1230;',
    '  background: linear-gradient(90deg,#7dd3fc,#a78bfa); }',
    '.btn:hover { filter: brightness(1.08); }',
    '.fine { font-size: 11px; color: #8f9bc0; margin: 10px 0 0; text-align: center; }',
    '.mini { all: unset; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 8px 14px 8px 8px; border-radius: 999px; font-weight: 700; font-size: 13px;',
    '  background: rgba(14,22,50,0.96); border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 10px 30px rgba(0,0,0,0.35); color: #eef2ff; }',
    '.dots { display: inline-block; width: 28px; text-align: left; }',
    '@media (prefers-reduced-motion: reduce) { .panel { animation: none; } }'
  ].join('\n');

  // Drawn inline so the extension does not have to expose its files to pages.
  var LOGO = '<svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="wa-g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#38bdf8"/><stop offset="0.55" stop-color="#8b5cf6"/><stop offset="1" stop-color="#f43f5e"/></linearGradient></defs>' +
    '<rect width="24" height="24" rx="6" fill="url(#wa-g)"/><path d="M5.5 8l2.4 8.4 3-6 3 6 2.4-8.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function ensureHost() {
    if (host && document.documentElement.contains(host)) return;
    host = document.createElement('walkaround-panel');
    root = host.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(host);
  }

  function header() {
    return '<div class="top">' + LOGO +
      '<span class="brand">Walkaround</span>' +
      '<button class="icon" data-act="min" aria-label="Minimize" title="Minimize">&#8211;</button>' +
      '<button class="icon" data-act="close" aria-label="Close" title="Close">&#215;</button></div>';
  }

  function okBody(d, got) {
    var html = '<p class="car">' + esc(d.car.name) + '</p>' +
      '<p class="sub">Engine ' + esc(d.engine.code) + ' &middot; risk ' + esc(d.engine.risk) +
      (d.miles != null ? ' &middot; ' + miles(d.miles) + ' mi' : '') + '</p>' +
      '<span class="pill ' + esc(d.verdict.cls) + '">' + esc(d.verdict.label) + '</span>' +
      '<p class="verdict">' + esc(d.verdict.text) + '</p>';
    if (d.price && d.offer < d.price) {
      html += '<div class="offer"><b>' + money(d.offer) + '</b><s>' + money(d.price) + '</s><span>opening offer</span></div>';
    } else if (d.price) {
      html += '<div class="offer"><b>' + money(d.price) + '</b><span>asking, nothing with a price is due</span></div>';
    } else {
      html += '<p class="note">Add the asking price on the full report to get an offer.</p>';
    }
    if (d.miles == null) {
      html += '<p class="note">We could not find the mileage on this page. Add it on the full report to see what is due.</p>';
    }
    if (d.anyMileage && d.anyMileage.length) {
      html += '<p class="label">Get proof of</p><ul>' + d.anyMileage.map(function (p) {
        return '<li>' + esc(p.name) + '<em>' + esc(p.cost) + '</em></li>';
      }).join('') + '</ul>';
    }
    if (d.due && d.due.length) {
      html += '<p class="label">Due at this mileage</p><ul>' + d.due.slice(0, 4).map(function (p) {
        return '<li>' + esc(p.name) + '<em>' + esc(p.cost) + '</em></li>';
      }).join('') + '</ul>';
    }
    if (d.recalls && d.recalls.count) {
      html += '<p class="note">' + d.recalls.count + ' recall' + (d.recalls.count === 1 ? '' : 's') + ' on record for this model year. The full report shows them.</p>';
    }
    if (got && got.market && got.price && got.price === d.price) {
      html += '<p class="note">The listing says this price is ' + money(got.market.amount) + (got.market.below ? ' below' : ' above') + ' market.</p>';
    }
    return html;
  }

  function render() {
    if (view.state === 'hidden' || view.closed) {
      if (host) host.remove();
      return;
    }
    ensureHost();
    var d = view.data;
    var html = '<style>' + CSS + '</style><div class="wrap" role="complementary" aria-label="Walkaround report">';
    if (view.minimized) {
      var label = view.state === 'ok' ? d.verdict.label : view.state === 'loading' ? 'Checking' : 'Walkaround';
      html += '<button class="mini" data-act="open" aria-label="Open the Walkaround report">' + LOGO + esc(label) + '</button></div>';
      root.innerHTML = html;
      bind();
      return;
    }
    html += '<div class="panel">' + header();
    if (view.state === 'loading') {
      var g = view.got || {};
      html += '<p class="car">' + esc([g.year, 'BMW', g.model].filter(Boolean).join(' ') || 'This BMW') + '</p>' +
        '<p class="sub">Checking engine, mileage and recalls<span class="dots">...</span></p>';
    } else if (view.state === 'error') {
      html += '<p class="car">Walkaround could not load</p><p class="sub">Check your connection and try again.</p>' +
        '<a class="btn" href="#" data-act="retry">Try again</a>';
    } else if (view.state === 'pick') {
      html += '<p class="car">' + esc(d.car.name) + '</p><p class="verdict">' + esc(d.engineHint) + '</p>' +
        '<a class="btn" href="' + esc(d.reportUrl) + '" target="_blank" rel="noopener">Pick the engine on the full report</a>';
    } else if (view.state === 'ok') {
      html += okBody(d, view.got) +
        '<a class="btn" href="' + esc(d.reportUrl) + '" target="_blank" rel="noopener">Full report and seller message</a>' +
        '<p class="fine">A research tool, not a mechanic. Always get an inspection.</p>';
    }
    html += '</div></div>';
    root.innerHTML = html;
    bind();
  }

  function bind() {
    Array.prototype.forEach.call(root.querySelectorAll('[data-act]'), function (node) {
      node.addEventListener('click', function (e) {
        var act = node.getAttribute('data-act');
        if (act === 'retry') { e.preventDefault(); lastKey = ''; scan(); return; }
        if (act === 'min') view.minimized = true;
        if (act === 'open') view.minimized = false;
        if (act === 'close') view.closed = true;
        render();
      });
    });
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || msg.type !== 'walkaround-show') return false;
    if (view.state === 'hidden') {
      lastKey = '';
      scan();
    }
    view.closed = false;
    view.minimized = false;
    render();
    sendResponse({ shown: view.state !== 'hidden' });
    return false;
  });

  // Listing sites load content late and change pages without reloading, so
  // look again when the page changes, at most about once a second.
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(function () { if (location.href !== lastUrl) schedule(); }, 1000);
  schedule();
})();
