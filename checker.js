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
  var state = { decoded: null, recalls: null, recallsKey: '' };

  var SOON_WINDOW = 15000;

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(value) {
    var n = parseInt(String(value || '').replace(/[^0-9]/g, ''), 10);
    return isNaN(n) ? null : n;
  }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function miles(n) { return Math.round(n).toLocaleString('en-US'); }
  function costText(cost) {
    if (!cost) return 'No price yet';
    var lo = cost[0], hi = cost[1];
    if (lo === 0 && hi === 0) return 'Free at a dealer';
    if (lo && hi) return money(lo) + ' to ' + money(hi);
    if (lo) return money(lo) + ' and up';
    return 'up to ' + money(hi);
  }
  function lowCost(cost) {
    if (!cost) return null;
    if (cost[0] === 0 && cost[1] === 0) return 0;
    return cost[0] || null;
  }

  function normalize(text) {
    var t = String(text || '').toLowerCase();
    t = t.replace(/x?drive|s?drive/g, '').replace(/gran coupe|gran turismo|coupe|convertible|sedan|wagon|series/g, '');
    t = t.replace(/[^a-z0-9]/g, '');
    t = t.replace(/^(\d{3})xi$/, '$1i');
    return t;
  }

  function findEngines(year, candidates) {
    var seen = {};
    var matches = [];
    candidates.forEach(function (c) {
      var key = normalize(c);
      if (!key) return;
      RULES.forEach(function (r) {
        if (r.model === key && year >= r.from_year && year <= r.to_year) {
          var id = r.engine + '|' + (r.note || '');
          if (!seen[id]) { seen[id] = true; matches.push(r); }
        }
      });
    });
    return matches;
  }

  function engineByCode(code) {
    for (var i = 0; i < ENGINES.engines.length; i++) {
      if (ENGINES.engines[i].code === code) return ENGINES.engines[i];
    }
    return null;
  }

  function recallModel(modelText) {
    var key = normalize(modelText);
    var m = key.match(/^([xz][1-7])/);
    if (m) return m[1].toUpperCase();
    m = key.match(/^(m[2-8])(?!\d)/);
    if (m) return m[1].toUpperCase();
    m = key.match(/^m?(\d{3}[a-z]*)/);
    if (m) return m[0];
    return modelText;
  }

  function fillEngineSelect(selected) {
    var options = ['<option value="">Pick the engine</option>'];
    ENGINES.engines.forEach(function (e) {
      options.push('<option value="' + esc(e.code) + '"' + (e.code === selected ? ' selected' : '') + '>' +
        esc(e.code + ' (' + e.desc + ')') + '</option>');
    });
    engineSelect.innerHTML = options.join('');
  }

  function resolveEngine() {
    var year = num(yearInput.value);
    var model = modelInput.value.trim();
    engineRow.hidden = false;
    if (!year || !model) {
      fillEngineSelect('');
      engineHint.textContent = 'Enter the year and model and we will match the engine.';
      return;
    }
    var words = model.split(/\s+/);
    var candidates = [model].concat(words);
    for (var w = 0; w < words.length - 1; w++) candidates.push(words[w] + ' ' + words[w + 1]);
    if (state.decoded) {
      var d = state.decoded;
      candidates.push(d.trim, d.series, d.model + ' ' + d.trim, d.model + ' ' + d.series);
    }
    var matches = findEngines(year, candidates);
    if (state.decoded && state.decoded.engineModel && engineByCode(state.decoded.engineModel.toUpperCase())) {
      fillEngineSelect(state.decoded.engineModel.toUpperCase());
      engineHint.textContent = 'From the VIN. Change it if the listing says otherwise.';
    } else if (matches.length === 1) {
      fillEngineSelect(matches[0].engine);
      engineHint.textContent = 'Matched from the year and model. Check the listing or under the hood, and change it if it is wrong.';
    } else if (matches.length > 1) {
      fillEngineSelect('');
      engineHint.textContent = 'This model had two engines that year: ' + matches.map(function (r) {
        return r.engine + (r.note ? ' (' + r.note + ')' : '');
      }).join(' or ') + '. Pick the one in this car.';
    } else {
      fillEngineSelect('');
      engineHint.textContent = 'We have not matched this model yet. Pick the engine if you know it. We cover ten common engines so far.';
    }
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
    return fetch('/api/recalls?model=' + encodeURIComponent(recallModel(model)) + '&year=' + year)
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (b) { state.recalls = b; return b; })
      .catch(function () { state.recalls = { error: true, recalls: [] }; return state.recalls; });
  }

  function classify(engine, mileage) {
    return engine.problems.map(function (p, i) {
      var from = p.due_from_miles;
      var status = 'watch';
      if (from != null && mileage != null) {
        if (mileage >= from) status = 'due';
        else if (mileage >= from - SOON_WINDOW) status = 'soon';
        else status = 'later';
      }
      return { index: i, p: p, status: status };
    });
  }

  function verdictFor(items, counted, asking) {
    var critical = items.filter(function (it) { return counted[it.index] && it.p.severity === 'critical'; });
    var total = 0;
    items.forEach(function (it) { if (counted[it.index]) total += lowCost(it.p.shop_cost_usd) || 0; });
    if (critical.length) return { label: 'Get proof or walk', cls: 'bad', text: 'This engine has a known failure that can cost as much as the car is worth. Only buy with written proof that ' + critical.map(function (c) { return c.p.name.toLowerCase(); }).join(' and ') + ' has been dealt with.' };
    if (asking && total > asking * 0.15) return { label: 'Negotiate hard', cls: 'bad', text: 'The work this car is due for adds up to more than 15% of the asking price. Do not pay full price without receipts.' };
    if (total > 0) return { label: 'Negotiate', cls: 'mid', text: 'Fair if the seller has receipts for the items below. If not, the price should come down by what that work costs.' };
    return { label: 'Fair if it checks out', cls: 'live', text: 'Nothing with a known price is due at this mileage. Still get an independent inspection before you pay.' };
  }

  function render() {
    var year = num(yearInput.value);
    var model = modelInput.value.trim();
    var mileage = num(milesInput.value);
    var asking = num(priceInput.value);
    var engine = engineByCode(engineSelect.value);
    if (!engine) { report.hidden = true; return; }

    var items = classify(engine, mileage);
    var counted = {};
    items.forEach(function (it) {
      var box = document.getElementById('count-' + it.index);
      counted[it.index] = box ? box.checked : it.status === 'due' && it.p.severity !== 'low' || (it.status === 'due' && lowCost(it.p.shop_cost_usd) !== null);
    });

    var total = 0, unpriced = [];
    items.forEach(function (it) {
      if (!counted[it.index]) return;
      var lc = lowCost(it.p.shop_cost_usd);
      if (lc === null) unpriced.push(it.p.name); else total += lc;
    });
    var offer = asking ? Math.max(0, Math.floor((asking - total) / 100) * 100) : null;
    var verdict = verdictFor(items, counted, asking);
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

    var dueNames = items.filter(function (it) { return counted[it.index]; }).map(function (it) { return it.p.name.toLowerCase(); });
    var recalls = state.recalls;
    var recallNames = (recalls && recalls.recalls || []).map(function (r) { return r.component.toLowerCase(); });

    var message = 'Hi, I\'m interested in your ' + carName + '. Before I come to see it, a few questions:\n' +
      (dueNames.length ? '- Do you have receipts for the ' + dueNames.join(', ') + '? These are known service items on the ' + engine.code + ' engine' + (mileage ? ' around this mileage' : '') + '.\n' : '') +
      '- How often was the oil changed, and do you have records?\n' +
      (recallNames.length ? '- Have the open recalls been done at a dealer?\n' : '') +
      '- Would you be OK with me taking it to an independent BMW shop for an inspection before buying?\nThanks!';

    var points = items.filter(function (it) { return counted[it.index]; }).map(function (it) {
      var p = it.p;
      var lc = lowCost(p.shop_cost_usd);
      var when = p.due_from_miles && mileage ? 'it usually shows up around ' + miles(p.due_from_miles) + ' miles and this car has ' + miles(mileage) : 'it is a known issue on this engine';
      return 'The ' + engine.code + ' is known for ' + p.name.toLowerCase() + ', and ' + when + '. Without a receipt I have to budget ' +
        (lc ? 'at least ' + money(lc) : 'for it') + '.';
    });
    if (!points.length) points.push('Nothing on this engine is due at this mileage, so focus on the service history and the inspection.');

    var pushback = [
      ['"It runs perfectly."', 'These parts usually fail without warning, which is why I\'m asking for receipts rather than how it drives.'],
      ['"I have other buyers."', 'That\'s fine. My offer is based on work the car is due for. If you can show it\'s been done, I can come up.'],
      ['"The price is firm."', 'Would you take care of the overdue items before the sale, or cover the cost of an inspection, instead of moving on price?']
    ];

    var recallHtml;
    if (!recalls) {
      recallHtml = '<p class="fine">Checking recalls.</p>';
    } else if (recalls.error) {
      recallHtml = '<p class="fine">We could not load recalls right now. Check the VIN at <a href="https://www.nhtsa.gov/recalls" rel="noopener">nhtsa.gov/recalls</a>.</p>';
    } else if (!recalls.recalls.length) {
      recallHtml = '<p class="fine">No recalls on record for the ' + esc(year + ' ' + recalls.model) + '. Confirm with the VIN at <a href="https://www.nhtsa.gov/recalls" rel="noopener">nhtsa.gov/recalls</a>.</p>';
    } else {
      recallHtml = '<div class="items">' + recalls.recalls.map(function (r) {
        return '<div class="item"><span class="dot red"></span><div class="what"><strong>' + esc(r.component) + '</strong><p>' + esc(r.summary) + '</p><div class="meta">NHTSA campaign ' + esc(r.campaign) + (r.date ? ', filed ' + esc(r.date) : '') + '</div></div><span class="cost">Free at a dealer</span></div>';
      }).join('') + '</div><p class="fine">These cover some cars from this model year, not all. Enter the VIN at <a href="https://www.nhtsa.gov/recalls" rel="noopener">nhtsa.gov/recalls</a> to see which ones are still open on this exact car.</p>';
    }

    var offerHtml;
    if (asking) {
      offerHtml = '<div class="offer-box"><div class="offer"><div class="was"><b>' + money(asking) + '</b>Asking</div><span class="arrow" aria-hidden="true">&rarr;</span><div><b class="grad-text">' + money(offer) + '</b>Your opening offer</div></div>' +
        '<p class="math">' + money(asking) + ' asking minus at least ' + money(total) + ' of work due without receipts' + (unpriced.length ? ', plus ' + esc(unpriced.join(', ').toLowerCase()) + ' with no price in our data, so get a quote' : '') + '.</p></div>';
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

  el('vin-btn').addEventListener('click', function () { decodeVin(); });
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
