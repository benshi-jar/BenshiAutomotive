// The report math, shared by the checker page (checker.js), the /api/report
// function the Chrome extension calls, and the tests. No page or network code
// here: every function takes the data it needs and returns plain values.
// `engines` is the parsed data/engines.json and `rules` is data/models.json's rules.
(function (root) {
  'use strict';

  var SOON_WINDOW = 15000;
  var BMW_WMI = /^(WBA|WBS|WBY|WBX|5UX|5UJ|5YM|4US)/;

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

  // Lowercase a problem name for use mid-sentence, but keep acronyms like PCV,
  // HPFP or VANOS in capitals.
  function lowerName(name) {
    return String(name).split(' ').map(function (w) {
      return /^[A-Z0-9]{2,}s?$/.test(w) ? w : w.toLowerCase();
    }).join(' ');
  }

  function lowCost(cost) {
    if (!cost) return null;
    if (cost[0] === 0 && cost[1] === 0) return 0;
    return cost[0] || null;
  }

  function normalize(text) {
    var t = String(text || '').toLowerCase().replace(/\bbmw\b/g, '');
    t = t.replace(/x?drive|s?drive/g, '').replace(/gran coupe|gran turismo|coupe|convertible|sedan|wagon|series/g, '');
    t = t.replace(/[^a-z0-9]/g, '');
    t = t.replace(/^(\d{3})xi$/, '$1i');
    return t;
  }

  function engineByCode(engines, code) {
    var list = engines.engines;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.code === code || (e.also_codes && e.also_codes.indexOf(code) !== -1)) return e;
    }
    return null;
  }

  // The VIN service reports engine codes like "N20B20" or "B58B30M1". The first
  // three characters are the family we track.
  function engineFromVin(engines, text) {
    var m = String(text || '').toUpperCase().match(/([NBS]\d{2})/);
    var e = m && engineByCode(engines, m[1]);
    return e ? e.code : null;
  }

  // Engine size and cylinder count from a decoded VIN, if it gave them.
  function vinSpec(decoded) {
    if (!decoded) return null;
    var liters = parseFloat(decoded.displacement);
    var cylinders = parseInt(decoded.cylinders, 10);
    liters = isNaN(liters) || liters <= 0 ? null : Math.round(liters * 10) / 10;
    cylinders = isNaN(cylinders) || cylinders <= 0 ? null : cylinders;
    return (liters || cylinders) ? { liters: liters, cylinders: cylinders } : null;
  }

  function fitsSpec(engines, code, spec) {
    var e = engineByCode(engines, code);
    if (!e || !spec || !e.cylinders) return true;
    if (spec.cylinders && spec.cylinders !== e.cylinders) return false;
    if (spec.liters && !e.liters.some(function (l) { return Math.abs(l - spec.liters) < 0.15; })) return false;
    return true;
  }

  function specText(spec) {
    var shape = { 4: 'four-cylinder', 6: 'six-cylinder', 8: 'V8' };
    return [spec.liters ? spec.liters.toFixed(1) + 'L' : '',
      spec.cylinders ? (shape[spec.cylinders] || spec.cylinders + '-cylinder') : ''].filter(Boolean).join(' ');
  }

  function orList(codes) {
    if (codes.length < 2) return codes.join('');
    return codes.slice(0, -1).join(', ') + ' or ' + codes[codes.length - 1];
  }

  function findEngines(rules, year, candidates) {
    var seen = {};
    var matches = [];
    candidates.forEach(function (c) {
      var key = normalize(c);
      if (!key) return;
      rules.forEach(function (r) {
        if (r.model === key && year >= r.from_year && year <= r.to_year) {
          var id = r.engine + '|' + (r.note || '');
          if (!seen[id]) { seen[id] = true; matches.push(r); }
        }
      });
    });
    return matches;
  }

  // Decide which engine a car has. Returns { code, hint } where code is '' when
  // the buyer has to pick, and hint explains the choice in plain words.
  function matchEngine(engines, rules, year, model, decoded) {
    if (!year || !model) return { code: '', hint: 'Enter the year and model and we will match the engine.' };
    var words = String(model).split(/\s+/);
    var candidates = [model].concat(words);
    for (var w = 0; w < words.length - 1; w++) candidates.push(words[w] + ' ' + words[w + 1]);
    if (decoded) {
      candidates.push(decoded.trim, decoded.series, decoded.model + ' ' + decoded.trim, decoded.model + ' ' + decoded.series);
    }
    var matches = findEngines(rules, year, candidates);
    var spec = vinSpec(decoded);
    var fit = matches.filter(function (r) { return fitsSpec(engines, r.engine, spec); });
    var vinCode = decoded && engineFromVin(engines, decoded.engineModel);

    if (vinCode) {
      return { code: vinCode, hint: 'From the VIN. Change it if the listing says otherwise.' };
    }
    if (matches.length > 1 && fit.length === 1) {
      return { code: fit[0].engine, hint: 'This model had more than one engine that year. The VIN lists a ' + specText(spec) +
        ', which is the ' + fit[0].engine + (fit[0].note ? ' (' + fit[0].note + ')' : '') + '.' };
    }
    if (matches.length === 1 && fit.length === 1) {
      return { code: matches[0].engine, hint: spec ?
        'Matched from the year and model, and the ' + specText(spec) + ' on the VIN agrees. Change it if the listing says otherwise.' :
        'Matched from the year and model. Check the listing or under the hood, and change it if it is wrong.' };
    }
    if (matches.length >= 1 && spec && !fit.length) {
      // Our table and the VIN disagree. Trust neither blindly: ask.
      var sized = engines.engines.filter(function (e) {
        var span = String(e.years || '').match(/(\d{4})\D+(\d{4})/);
        return fitsSpec(engines, e.code, spec) && (!span || (year >= +span[1] && year <= +span[2]));
      }).map(function (e) { return e.code; });
      return { code: '', hint: 'Our table says the ' + year + ' ' + model + ' has the ' + orList(matches.map(function (r) { return r.engine; })) +
        ', but the VIN lists a ' + specText(spec) + '. Check the listing and pick the engine' +
        (sized.length ? ' (probably the ' + orList(sized) + ')' : '') + '.' };
    }
    if (matches.length > 1) {
      var options = fit.length ? fit : matches;
      return { code: '', hint: 'This model had more than one engine that year: ' + options.map(function (r) {
        return r.engine + (r.note ? ' (' + r.note + ')' : '');
      }).join(' or ') + '. Pick the one in this car. The listing or the sticker under the hood will say.' };
    }
    return { code: '', hint: 'We have not matched this model yet' + (spec ? ' (the VIN lists a ' + specText(spec) + ')' : '') +
      '. If the listing names one of the engines here, pick it. If not, we do not cover this car yet.' };
  }

  // The model name NHTSA's recall search expects: "X5", "M3" or "335i".
  // Drops "3 Series" and drivetrain words first, so "5 Series 540i Sedan RWD"
  // becomes "540i" rather than "554".
  function recallModel(modelText) {
    var text = String(modelText || '').replace(/\b\d\s*-?\s*series\b/ig, ' ').replace(/\b(rwd|awd|fwd|4wd|4x4)\b/ig, ' ');
    var key = normalize(text);
    var m = key.match(/^([xz][1-7])/);
    if (m) return m[1].toUpperCase();
    m = key.match(/^(m[2-8])(?!\d)/);
    if (m) return m[1].toUpperCase();
    m = key.match(/^m?\d{3}(?:li|is|ci|xi|i|d|e)?/);
    if (m) return m[0];
    return modelText;
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

  // Counted by default: anything due that is either serious or has a price,
  // unless the data marks it as optional (count_by_default: false).
  function defaultCounted(item) {
    if (item.p.count_by_default === false) return false;
    return item.status === 'due' && (item.p.severity !== 'low' || lowCost(item.p.shop_cost_usd) !== null);
  }

  function totals(items, counted) {
    var total = 0, unpriced = [];
    items.forEach(function (it) {
      if (!counted[it.index]) return;
      var lc = lowCost(it.p.shop_cost_usd);
      if (lc === null) unpriced.push(it.p.name); else total += lc;
    });
    return { total: total, unpriced: unpriced };
  }

  function offerFor(asking, total) {
    return asking ? Math.max(0, Math.floor((asking - total) / 100) * 100) : null;
  }

  function verdictFor(items, counted, asking) {
    var critical = items.filter(function (it) { return counted[it.index] && it.p.severity === 'critical'; });
    var total = totals(items, counted).total;
    if (critical.length) return { label: 'Get proof or walk', cls: 'bad', text: 'This engine has a known failure that can cost as much as the car is worth. Only buy with written proof that ' + critical.map(function (c) { return lowerName(c.p.name); }).join(' and ') + ' has been dealt with.' };
    // A critical failure with no typical mileage (the N20 timing chain, N63 oil
    // consumption) is not added to the offer, but it decides the verdict.
    var anyMileage = criticalAnyMileage(items, counted);
    if (anyMileage.length) return { label: 'Get proof first', cls: 'bad', text: 'This engine has ' +
      (anyMileage.length > 1 ? 'known weak points: ' : 'a known weak point: ') +
      anyMileage.map(function (it) { return lowerName(it.p.name); }).join(', and ') +
      '. ' + (anyMileage.length > 1 ? 'These can' : 'It can') + ' happen at any mileage and cost a lot to fix. Ask for proof it was fixed or checked before you go further.' +
      (total > 0 ? ' The work due at this mileage should also come off the price.' : '') };
    if (asking && total > asking * 0.15) return { label: 'Negotiate hard', cls: 'bad', text: 'The work this car is due for adds up to more than 15% of the asking price. Do not pay full price without receipts.' };
    if (total > 0) return { label: 'Negotiate', cls: 'mid', text: 'Fair if the seller has receipts for the items below. If not, the price should come down by what that work costs.' };
    var unpricedDue = items.filter(function (it) { return counted[it.index] && lowCost(it.p.shop_cost_usd) === null; });
    if (unpricedDue.length) return { label: 'Ask for receipts', cls: 'mid', text: 'Known items are due at this mileage, but our sources give no price for them. Ask for receipts, and get a shop quote before you settle on an offer.' };
    return { label: 'Fair if it checks out', cls: 'live', text: 'Nothing with a known price is due at this mileage. Still get an independent inspection before you pay.' };
  }

  // Critical problems that can happen at any mileage and are not already counted.
  function criticalAnyMileage(items, counted) {
    return items.filter(function (it) { return !counted[it.index] && it.status === 'watch' && it.p.severity === 'critical'; });
  }

  var api = {
    SOON_WINDOW: SOON_WINDOW, BMW_WMI: BMW_WMI,
    money: money, miles: miles, costText: costText, lowerName: lowerName, lowCost: lowCost,
    normalize: normalize, engineByCode: engineByCode, engineFromVin: engineFromVin, vinSpec: vinSpec,
    fitsSpec: fitsSpec, specText: specText, orList: orList, findEngines: findEngines, matchEngine: matchEngine,
    recallModel: recallModel, classify: classify, defaultCounted: defaultCounted, totals: totals,
    offerFor: offerFor, verdictFor: verdictFor, criticalAnyMileage: criticalAnyMileage
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WalkaroundCore = api;
})(this);
