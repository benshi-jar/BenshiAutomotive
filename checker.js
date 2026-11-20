// The Walkaround checker. Everything runs in the browser except the VIN decode
// and recall lookup, which go through the site's own /api functions.
(function () {
  'use strict';

  var form = document.getElementById('car-form');
  if (!form) return;

  var el = function (id) { return document.getElementById(id); };
  var vinInput = el('f-vin');
  var yearInput = el('f-year');
  var modelInput = el('f-model');
  var milesInput = el('f-miles');
  var priceInput = el('f-price');
  var engineRow = el('engine-row');
  var engineSelect = el('f-engine');
  var engineHint = el('engine-hint');
  var vinStatus = el('vin-status');
  var formStatus = el('form-status');
  var report = el('report');

  var ENGINES = null;
  var RULES = null;
  var state = { decoded: null, recalls: null, recallsKey: '', countKey: '', market: null };

  // The report math lives in report-core.js so the site, the /api/report
  // function and the Chrome extension all agree.
  var C = window.WalkaroundCore;
  var money = C.money, miles = C.miles, costText = C.costText, lowerName = C.lowerName, lowCost = C.lowCost;

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(value) {
    var n = parseInt(String(value || '').replace(/[^0-9]/g, ''), 10);
    return isNaN(n) ? null : n;
  }
  function engineByCode(code) { return C.engineByCode(ENGINES, code); }

  function fillEngineSelect(selected) {
    var options = ['<option value="">Pick the engine</option>'];
    ENGINES.engines.forEach(function (e) {
      options.push('<option value="' + esc(e.code) + '"' + (e.code === selected ? ' selected' : '') + '>' +
        esc(e.code + ' (' + e.desc + ')') + '</option>');
    });
    engineSelect.innerHTML = options.join('');
  }

  function resolveEngine() {
    engineRow.hidden = false;
    var match = C.matchEngine(ENGINES, RULES, num(yearInput.value), modelInput.value.trim(), state.decoded);
    fillEngineSelect(match.code);
    engineHint.textContent = match.hint;
  }

  function decodeVin() {
    var vin = vinInput.value.trim().toUpperCase();
    if (!vin) return Promise.resolve();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
      vinStatus.textContent = 'A VIN is 17 letters and numbers, and never uses I, O or Q.';
      vinStatus.className = 'status error';
      return Promise.resolve();
    }
    vinStatus.textContent = 'Looking up the VIN.';
    vinStatus.className = 'status';
    return fetch('/api/vin?vin=' + encodeURIComponent(vin))
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.body.error || 'lookup failed');
        var d = res.body;
        state.decoded = d;
        if (d.make && d.make.toUpperCase() !== 'BMW') {
          state.decoded = { vin: d.vin, make: d.make };
          vinStatus.textContent = 'That VIN belongs to a ' + d.make + '. Walkaround only covers BMW so far.';
          vinStatus.className = 'status error';
          return;
        }
        if (d.year) yearInput.value = d.year;
        var name = [d.model, d.trim].filter(Boolean).join(' ');
        if (name) modelInput.value = name;
        vinStatus.textContent = 'Found: ' + [d.year, d.make, name, d.body].filter(Boolean).join(' ') + '.';
        vinStatus.className = 'status';
        resolveEngine();
      })
      .catch(function (err) {
        vinStatus.textContent = (err && err.message && err.message !== 'lookup failed') ? err.message :
          'We could not look up that VIN. Enter the year and model instead.';
        vinStatus.className = 'status error';
      });
  }

  function loadRecalls(model, year) {
    var key = model + '|' + year;
    if (state.recallsKey === key && state.recalls) return Promise.resolve(state.recalls);
    state.recallsKey = key;
    state.recalls = null;
    return fetch('/api/recalls?model=' + encodeURIComponent(C.recallModel(model)) + '&year=' + year)
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (b) { state.recalls = b; return b; })
      .catch(function () { state.recalls = { error: true, recalls: [] }; return state.recalls; });
  }

  // NHTSA sends dates as day/month/year. Write them out so US readers do not
  // read 12/07/2018 as December 7.
  function recallDate(text) {
    var m = String(text).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return text;
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[+m[2] - 1] + ' ' + (+m[1]) + ', ' + m[3];
  }

  // "AIR BAGS:FRONTAL:DRIVER SIDE" reads better as "Air bags: frontal: driver side".
  function recallTitle(text) {
    var t = String(text || '').toLowerCase().replace(/:/g, ': ');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function recallCheckLink() {
    var vin = vinInput.value.trim().toUpperCase();
    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
      return '<a href="https://www.nhtsa.gov/recalls?vymm=' + encodeURIComponent(vin) + '" target="_blank" rel="noopener">Check open recalls for this exact VIN on nhtsa.gov</a>.';
    }
    return 'Enter the VIN at <a href="https://www.nhtsa.gov/recalls" target="_blank" rel="noopener">nhtsa.gov/recalls</a> to see which ones are still open on this exact car.';
  }

  function render() {
    var year = num(yearInput.value);
    var model = modelInput.value.trim();
    var mileage = num(milesInput.value);
    var asking = num(priceInput.value);
    var engine = engineByCode(engineSelect.value);
    if (!engine) { report.hidden = true; return; }

    var items = C.classify(engine, mileage);
    var counted = {};
    // Checkboxes on screen belong to the last report. Only keep the buyer's
    // ticks if that report was for the same engine and mileage.
    var countKey = engine.code + '|' + mileage;
    var keepTicks = state.countKey === countKey;
    state.countKey = countKey;
    items.forEach(function (it) {
      var box = keepTicks ? document.getElementById('count-' + it.index) : null;
      counted[it.index] = box ? box.checked : C.defaultCounted(it);
    });

    var sums = C.totals(items, counted);
    var total = sums.total, unpriced = sums.unpriced;
    var offer = C.offerFor(asking, total);
    var verdict = C.verdictFor(items, counted, asking);
    var carName = [year, 'BMW', model].filter(Boolean).join(' ');

    var groups = [
      ['due', 'Due at this mileage', 'The source says these usually show up by now. Untick any the seller has a receipt for.'],
      ['soon', 'Coming up in the next 15,000 miles', 'Not due yet, but close. Worth asking about.'],
      ['watch', 'Can happen at any mileage', 'No typical mileage in our sources. Tick one to count it if you have reason to.'],
      ['later', 'Not due for a while', '']
    ];
    var listHtml = groups.map(function (g) {
      var rows = items.filter(function (it) { return it.status === g[0]; });
      if (!rows.length) return '';
      return '<div class="group"><h3>' + esc(g[1]) + '</h3>' + (g[2] ? '<p class="fine">' + esc(g[2]) + '</p>' : '') +
        '<div class="items">' + rows.map(function (it) {
          var p = it.p;
          var dot = (p.severity === 'high' || p.severity === 'critical') ? 'dot red' : 'dot';
          var meta = p.typical_miles ? 'Usually ' + p.typical_miles + ' miles' : '';
          return '<label class="item pick" for="count-' + it.index + '"><span class="' + dot + '"></span>' +
            '<div class="what"><strong>' + esc(p.name) + '</strong><p>' + esc(p.what_happens) + (p.note ? ' ' + esc(p.note) : '') + '</p>' +
            (meta ? '<div class="meta">' + esc(meta) + '</div>' : '') + '</div>' +
            '<span class="pick-side"><span class="cost">' + esc(costText(p.shop_cost_usd)) + '</span>' +
            '<span class="tick-wrap"><input type="checkbox" id="count-' + it.index + '"' + (counted[it.index] ? ' checked' : '') + '> Count it</span></span></label>';
        }).join('') + '</div></div>';
    }).join('');

    var dueNames = items.filter(function (it) { return counted[it.index]; }).map(function (it) { return lowerName(it.p.name); });
    var recalls = state.recalls;
    var recallNames = (recalls && recalls.recalls || []).map(function (r) { return r.component.toLowerCase(); });

    var anyMileage = C.criticalAnyMileage(items, counted).map(function (it) { return lowerName(it.p.name); });
    var message = 'Hi, I\'m interested in your ' + carName + '. Before I come to see it, a few questions:\n' +
      (anyMileage.length ? '- Has anything been done about the ' + anyMileage.join(' or the ') + '? Do you have paperwork? It is a known weak point on the ' + engine.code + '.\n' : '') +
      (dueNames.length ? '- Do you have receipts for the ' + dueNames.join(', ') + '? These are known service items on the ' + engine.code + ' engine' + (mileage ? ' around this mileage' : '') + '.\n' : '') +
      '- How often was the oil changed, and do you have records?\n' +
      (recallNames.length ? '- Have the open recalls been done at a dealer?\n' : '') +
      '- Would you be OK with me taking it to an independent BMW shop for an inspection before buying?\nThanks!';

    var points = items.filter(function (it) { return counted[it.index]; }).map(function (it) {
      var p = it.p;
      var lc = lowCost(p.shop_cost_usd);
      var when = p.due_from_miles && mileage ? 'it usually shows up around ' + miles(p.due_from_miles) + ' miles and this car has ' + miles(mileage) : 'it is a known issue on this engine';
      return 'The ' + engine.code + ' is known for ' + lowerName(p.name) + ', and ' + when + '. Without a receipt I have to budget ' +
        (lc ? 'at least ' + money(lc) : 'for it') + '.';
    });
    anyMileage.forEach(function (name) {
      points.unshift('The ' + engine.code + ' is known for ' + name + ' at any mileage. Without paperwork showing it was done, I am pricing in the risk of a big repair.');
    });
    if (!points.length) points.push('Nothing on this engine is due at this mileage, so focus on the service history and the inspection.');
    var market = state.market && asking && state.market.price === asking ? state.market : null;
    if (market && !market.below) {
      points.push('The listing site itself says this price is ' + money(market.amount) + ' above market, so there is room to come down on that alone.');
    }

    var pushback = [
      ['"It runs perfectly."', 'These parts usually fail without warning, which is why I\'m asking for receipts rather than how it drives.'],
      ['"I have other buyers."', 'That\'s fine. My offer is based on work the car is due for. If you can show it\'s been done, I can come up.'],
      ['"The price is firm."', 'Would you take care of the overdue items before the sale, or cover the cost of an inspection, instead of moving on price?']
    ];

    var recallHtml;
    if (!recalls) {
      recallHtml = '<p class="fine">Checking recalls.</p>';
    } else if (recalls.error) {
      recallHtml = '<p class="fine">We could not load recalls right now. ' + recallCheckLink() + '</p>';
    } else if (!recalls.recalls.length) {
      recallHtml = '<p class="fine">No recalls on record for the ' + esc(year + ' ' + recalls.model) + '. ' + recallCheckLink() + '</p>';
    } else {
      recallHtml = '<div class="items">' + recalls.recalls.map(function (r) {
        var summary = String(r.summary || '');
        var body = summary.length > 260 ?
          '<p class="short">' + esc(summary.slice(0, 240).replace(/\s+\S*$/, '')) + '&hellip;</p><details class="more"><summary>Read the full recall</summary><p>' + esc(summary) + '</p></details>' :
          '<p>' + esc(summary) + '</p>';
        return '<div class="item"><span class="dot red"></span><div class="what"><strong>' + esc(recallTitle(r.component)) + '</strong>' + body +
          '<div class="meta">NHTSA campaign ' + esc(r.campaign) + (r.date ? ', filed ' + esc(recallDate(r.date)) : '') + '</div></div><span class="cost">Free at a dealer</span></div>';
      }).join('') + '</div><p class="fine">These cover some cars from this model year, not all. ' + recallCheckLink() + '</p>';
    }

    var offerHtml;
    if (asking) {
      offerHtml = '<div class="offer-box"><div class="offer"><div class="was"><b>' + money(asking) + '</b>Asking</div><span class="arrow" aria-hidden="true">&rarr;</span><div><b class="grad-text">' + money(offer) + '</b>Your opening offer</div></div>' +
        '<p class="math">' + money(asking) + ' asking minus at least ' + money(total) + ' of work due without receipts' + (unpriced.length ? ', plus ' + esc(unpriced.map(lowerName).join(', ')) + ' with no price in our data, so get a quote' : '') + '.</p>' +
        (market ? '<p class="math market">The listing site says this price is ' + money(market.amount) + (market.below ? ' below market, so it is already priced well. Lean on the repair items, not the price.' : ' above market. Use that too: ask the seller to come down at least that much.') + '</p>' : '') +
        '</div>';
    } else {
      offerHtml = '<p class="math">Add the asking price above to get an offer. Work due without receipts: at least ' + money(total) + '.</p>';
    }

    report.innerHTML =
      '<div class="card report">' +
        '<div class="report-head"><div class="car"><h3>' + esc(carName || 'Your BMW') + '</h3><div class="chips">' +
          '<span class="chip">Engine <b>' + esc(engine.code) + '</b></span>' +
          (mileage ? '<span class="chip">Miles <b>' + miles(mileage) + '</b></span>' : '') +
          (asking ? '<span class="chip">Asking <b>' + money(asking) + '</b></span>' : '') +
          '<span class="chip">Engine risk <b>' + esc(engine.risk) + '</b></span></div></div>' +
          '<span class="pill big ' + verdict.cls + '">' + esc(verdict.label) + '</span></div>' +
        '<div class="verdict"><strong>' + esc(verdict.label) + '.</strong> ' + esc(verdict.text) + '</div>' +
        (mileage ? '' : '<p class="fine">Add the mileage to see what is due now.</p>') +
        listHtml +
        '<div class="group"><h3>Recalls</h3>' + recallHtml + '</div>' +
      '</div>' +
      '<div class="card report"><div class="group"><span class="eyebrow">Negotiation</span><h3>Your offer</h3>' + offerHtml + '</div>' +
        '<div class="group"><h3>Message to send the seller first</h3><pre class="copy-text" id="msg-text">' + esc(message) + '</pre><button class="btn small" type="button" data-copy="msg-text">Copy message</button></div>' +
        '<div class="group"><h3>What to say in person</h3><ul class="ask">' + points.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
        '<div class="group"><h3>If the seller pushes back</h3><div class="items">' + pushback.map(function (p) { return '<div class="item"><span class="dot"></span><div class="what"><strong>' + esc(p[0]) + '</strong><p>' + esc(p[1]) + '</p></div></div>'; }).join('') + '</div></div>' +
        '<p class="fine">Walkaround is a research tool, not a mechanic. Costs are the low end of what our sources quote and vary by shop. Always get a pre-purchase inspection. Read the full <a href="/engines/' + esc(engine.code.toLowerCase()) + '">' + esc(engine.code) + ' guide</a> and its sources.</p>' +
      '</div>';
    report.hidden = false;

    items.forEach(function (it) {
      var box = document.getElementById('count-' + it.index);
      if (box) box.addEventListener('change', render);
    });
    Array.prototype.forEach.call(report.querySelectorAll('[data-copy]'), function (btn) {
      btn.addEventListener('click', function () {
        var target = document.getElementById(btn.getAttribute('data-copy'));
        var text = target.textContent;
        var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy message'; }, 1800); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { selectText(target); });
        } else { selectText(target); }
      });
    });
  }

  function selectText(node) {
    var range = document.createRange();
    range.selectNodeContents(node);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function saveToUrl() {
    var params = new URLSearchParams();
    if (vinInput.value.trim()) params.set('vin', vinInput.value.trim().toUpperCase());
    if (yearInput.value) params.set('year', yearInput.value);
    if (modelInput.value.trim()) params.set('model', modelInput.value.trim());
    if (milesInput.value) params.set('miles', num(milesInput.value));
    if (priceInput.value) params.set('price', num(priceInput.value));
    if (engineSelect.value) params.set('engine', engineSelect.value);
    try { history.replaceState(null, '', '?' + params.toString()); } catch (e) { /* ignore */ }
  }

  function build() {
    formStatus.textContent = '';
    formStatus.className = 'status';
    var year = num(yearInput.value);
    if (!engineSelect.value) {
      resolveEngine();
      if (!engineSelect.value) {
        formStatus.textContent = 'Pick the engine to build the report.';
        formStatus.className = 'status error';
        report.hidden = true;
        return;
      }
    }
    saveToUrl();
    render();
    if (year && modelInput.value.trim()) {
      loadRecalls(modelInput.value.trim(), year).then(render);
    }
    report.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Paste the whole listing: pick out what we can, fill the form, and build the
  // report straight away when there is enough to go on.
  var pasteBox = el('f-paste');
  var pasteStatus = el('paste-status');
  var pasteTimer = null;

  function listJoin(parts) {
    if (parts.length < 2) return parts.join('');
    return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  }

  function applyPaste() {
    var text = pasteBox.value.trim();
    if (!text || !ENGINES || !window.WalkaroundParse) return;
    if (/^https?:\/\/\S+$/i.test(text)) {
      pasteStatus.textContent = 'That is a link. We cannot open listing sites for you, so open the listing and copy the text on the page instead.';
      pasteStatus.className = 'status error';
      return;
    }
    var got = window.WalkaroundParse.parseListing(text);
    var found = [];
    if (got.vin) found.push('the VIN');
    if (got.year && got.model) found.push('a ' + got.year + ' ' + got.model);
    if (got.miles != null) found.push(miles(got.miles) + ' miles');
    if (got.price) found.push(money(got.price) + ' asking');
    if (!found.length) {
      pasteStatus.textContent = 'We could not find a VIN, mileage or price in that text. Try copying more of the page, or fill it in below.';
      pasteStatus.className = 'status error';
      return;
    }
    // A paste is a new car, so start clean.
    state.decoded = null;
    state.market = got.market && got.price ? { amount: got.market.amount, below: got.market.below, price: got.price } : null;
    vinInput.value = got.vin || '';
    vinStatus.textContent = '';
    if (got.year) yearInput.value = got.year;
    if (got.model) modelInput.value = got.model;
    milesInput.value = got.miles != null ? miles(got.miles) : '';
    priceInput.value = got.price ? money(got.price) : '';
    var missing = [];
    if (!got.vin && !(got.year && got.model)) missing.push('the year and model');
    if (got.miles == null) missing.push('the mileage');
    if (!got.price) missing.push('the asking price');
    pasteStatus.textContent = 'Found ' + listJoin(found) + '. Check them below' +
      (missing.length ? ' and add ' + listJoin(missing) : '') + '.';
    pasteStatus.className = 'status';
    var ready = got.vin ? decodeVin() : Promise.resolve();
    ready.then(function () {
      resolveEngine();
      if (engineSelect.value && (milesInput.value || priceInput.value)) build();
    });
  }

  pasteBox.addEventListener('input', function () {
    clearTimeout(pasteTimer);
    pasteTimer = setTimeout(applyPaste, 350);
  });

  el('vin-btn').addEventListener('click', function () { decodeVin(); });
  vinInput.addEventListener('input', function () {
    if (state.decoded && vinInput.value.trim().toUpperCase() !== state.decoded.vin) { state.decoded = null; state.market = null; }
  });
  yearInput.addEventListener('change', function () { state.decoded = state.decoded && num(yearInput.value) === state.decoded.year ? state.decoded : null; resolveEngine(); });
  modelInput.addEventListener('change', resolveEngine);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var pending = (vinInput.value.trim() && !state.decoded) ? decodeVin() : Promise.resolve();
    pending.then(build);
  });

  Promise.all([
    fetch('/data/engines.json').then(function (r) { return r.json(); }),
    fetch('/data/models.json').then(function (r) { return r.json(); })
  ]).then(function (data) {
    ENGINES = data[0];
    RULES = data[1].rules;
    var list = el('model-list');
    var names = {};
    RULES.forEach(function (r) { names[r.label || r.model] = true; });
    list.innerHTML = Object.keys(names).sort().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
    fillEngineSelect('');

    var q = new URLSearchParams(location.search);
    if (q.get('vin')) vinInput.value = q.get('vin');
    if (q.get('year')) yearInput.value = q.get('year');
    if (q.get('model')) modelInput.value = q.get('model');
    if (q.get('miles')) milesInput.value = q.get('miles');
    if (q.get('price')) priceInput.value = q.get('price');
    var start = q.get('vin') && !q.get('model') ? decodeVin() : Promise.resolve();
    start.then(function () {
      if (yearInput.value && modelInput.value) resolveEngine();
      if (q.get('engine') && engineByCode(q.get('engine')) && engineSelect.value !== q.get('engine')) {
        fillEngineSelect(q.get('engine'));
        engineRow.hidden = false;
        engineHint.textContent = 'Engine picked when this report was made. Change it if it is wrong.';
      }
      if (engineSelect.value && (milesInput.value || priceInput.value)) build();
    });
  }).catch(function () {
    formStatus.textContent = 'The checker could not load its data. Refresh the page to try again.';
    formStatus.className = 'status error';
  });
})();
