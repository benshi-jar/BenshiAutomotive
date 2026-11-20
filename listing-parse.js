// Pulls the VIN, mileage, asking price, year and model out of text a buyer
// copied from a listing page (Cars.com, Autotrader, CarGurus, Facebook
// Marketplace, Craigslist and so on). Runs in the browser and in Node tests.
// Nothing is fetched: it only reads the text it is given.
(function (root) {
  'use strict';

  var VIN_VALUES = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
  var VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  // World manufacturer codes BMW uses on US cars.
  var BMW_WMI = /^(WBA|WBS|WBY|WBX|5UX|5UJ|5YM|4US)/;

  function vinCheckDigitOk(vin) {
    var sum = 0;
    for (var i = 0; i < 17; i++) {
      var c = vin.charAt(i);
      var v = /\d/.test(c) ? +c : VIN_VALUES[c];
      if (v == null) return false;
      sum += v * VIN_WEIGHTS[i];
    }
    var check = sum % 11;
    return vin.charAt(8) === (check === 10 ? 'X' : String(check));
  }

  function findVin(text) {
    var upper = text.toUpperCase();
    var re = /(?:^|[^A-Z0-9])([A-HJ-NPR-Z0-9]{17})(?=[^A-Z0-9]|$)/g;
    var best = null, bestScore = -1, m;
    while ((m = re.exec(upper))) {
      var vin = m[1];
      if (!/\d/.test(vin) || !/[A-Z]/.test(vin)) continue;
      var score = 0;
      if (vinCheckDigitOk(vin)) score += 2;
      if (BMW_WMI.test(vin)) score += 2;
      if (/VIN[^A-Z0-9]{0,4}$/.test(upper.slice(Math.max(0, m.index - 6), m.index + 1))) score += 1;
      if (score > bestScore) { best = vin; bestScore = score; }
      re.lastIndex = m.index + 1;
    }
    return best;
  }

  function toNumber(digits, k) {
    var n = parseFloat(String(digits).replace(/,/g, ''));
    if (isNaN(n)) return null;
    return Math.round(k ? n * 1000 : n);
  }

  function findMiles(text) {
    var re = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k\b)?\s*(miles|mile|mi\b\.?)/gi;
    var labelled = /(mileage|odometer|driven|miles)\s*[:\-]?\s*(\d{1,3}(?:,\d{3})+|\d{1,6})(\s*k\b)?/gi;
    var cands = [], m;
    while ((m = re.exec(text))) {
      var after = text.slice(m.index + m[0].length, m.index + m[0].length + 18).toLowerCase();
      var before = text.slice(Math.max(0, m.index - 30), m.index).toLowerCase();
      if (/^\s*(away|from|radius|per|range|warranty|\/|or\b|-?mile warranty)/.test(after)) continue;
      if (/(within|warranty|every|up to|range|radius|powertrain|limited|under|over|below|above|less than|more than|\/|\bor)\s*$/.test(before)) continue;
      if (/(yr|year|years)\s*\/?\s*$/.test(before)) continue;
      var n = toNumber(m[1], m[2]);
      if (n == null || n > 400000) continue;
      var score = /(mileage|odometer|driven)[^0-9]{0,12}$/.test(before) ? 3 : 1;
      if (n < 50) score -= 1;
      cands.push({ n: n, score: score, at: m.index });
    }
    while ((m = labelled.exec(text))) {
      var n2 = toNumber(m[2], m[3]);
      if (n2 == null || n2 > 400000) continue;
      var tail = text.slice(m.index + m[0].length, m.index + m[0].length + 12).toLowerCase();
      if (/^\s*(away|per|\/)/.test(tail)) continue;
      cands.push({ n: n2, score: 3, at: m.index });
    }
    cands.sort(function (a, b) { return b.score - a.score || a.at - b.at; });
    return cands.length && cands[0].score > 0 ? cands[0].n : null;
  }

  function findPrice(text) {
    var re = /\$\s?(\d{1,3}(?:,\d{3})+|\d{4,6})(?:\.\d{2})?(\s*k\b)?/gi;
    var cands = [], m;
    while ((m = re.exec(text))) {
      var n = toNumber(m[1], m[2]);
      if (n == null || n < 1000 || n > 500000) continue;
      var after = text.slice(m.index + m[0].length, m.index + m[0].length + 22).toLowerCase();
      var before = text.slice(Math.max(0, m.index - 28), m.index).toLowerCase();
      if (/^\s*(\/|per\b|a month|mo\b|mo\.|month|down|below|above|under|over|off|less|more|savings|fee|drop|est|in savings|lower|higher|cash back|rebate)/.test(after)) continue;
      if (/(drop|dropped|reduced|save|saving|savings|msrp|kbb|value|down payment|down|payment|fee|below|above|was|original|estimate|est\.|trade|market|rebate|loan|financ|tax)[^$]{0,12}$/.test(before)) continue;
      var score = /(price|asking|listed|for sale|obo|selling)[^$]{0,14}$/.test(before) ? 3 : 1;
      cands.push({ n: n, score: score, at: m.index });
    }
    cands.sort(function (a, b) { return b.score - a.score || a.at - b.at; });
    return cands.length ? cands[0].n : null;
  }

  function findYearModel(text) {
    var m = text.match(/\b(199\d|20[0-3]\d)\s+BMW\s+([^\n\r$|·•,(]{1,48})/i);
    if (!m) return { year: null, model: null };
    var model = m[2]
      .replace(/\s+(for sale|in\s+[A-Z][a-z]+|near|with|w\/|-|–|—).*$/i, '')
      .replace(/\s+\d{1,3}(,\d{3})+.*$/, '')
      .trim()
      .split(/\s+/).slice(0, 5).join(' ');
    return { year: +m[1], model: model || null };
  }

  function parseListing(text) {
    text = String(text || '');
    var ym = findYearModel(text);
    return {
      vin: findVin(text),
      miles: findMiles(text),
      price: findPrice(text),
      year: ym.year,
      model: ym.model
    };
  }

  var api = { parseListing: parseListing, vinCheckDigitOk: vinCheckDigitOk };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WalkaroundParse = api;
})(this);
