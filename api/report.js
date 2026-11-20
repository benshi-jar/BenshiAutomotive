// A short report for one car, used by the Walkaround Chrome extension.
// Runs on Vercel at /api/report?vin=...&miles=...&price=... (or year and model instead of a VIN).
// It uses the same math as the checker page (report-core.js) and the same data files.
const core = require('../report-core.js');
const ENGINES = require('../data/engines.json');
const RULES = require('../data/models.json').rules;
const { VIN_PATTERN, decodeVin, fetchRecalls } = require('./_lib/nhtsa.js');

function int(value, max) {
  const n = parseInt(String(value || '').replace(/[^0-9]/g, ''), 10);
  return isNaN(n) || n < 0 || n > max ? null : n;
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const vin = String(q.vin || '').trim().toUpperCase();
  let year = int(q.year, 2035);
  let model = String(q.model || '').trim().slice(0, 48);
  const miles = int(q.miles, 600000);
  const price = int(q.price, 2000000);
  if (vin && !VIN_PATTERN.test(vin)) {
    res.status(400).json({ status: 'bad-input', error: 'A VIN is 17 letters and numbers, and never uses I, O or Q.' });
    return;
  }
  if (model && !/^[A-Za-z0-9 .\-\/]+$/.test(model)) model = '';

  let decoded = null;
  if (vin) {
    try { decoded = await decodeVin(vin); } catch (err) { decoded = null; }
    if (decoded && decoded.make && decoded.make.toUpperCase() !== 'BMW') {
      res.status(200).json({ status: 'not-bmw', make: decoded.make, error: 'That VIN belongs to a ' + decoded.make + '. Walkaround only covers BMW so far.' });
      return;
    }
    if (decoded) {
      if (decoded.year) year = decoded.year;
      const name = [decoded.model, decoded.trim].filter(Boolean).join(' ');
      if (name) model = name;
    }
  }
  if (!year || !model) {
    res.status(200).json({ status: 'need-model', error: 'We need the VIN, or the year and model, to check this car.' });
    return;
  }

  const host = String(req.headers && req.headers.host || 'benshiautomotive.vercel.app');
  const proto = (req.headers && req.headers['x-forwarded-proto']) || (/^localhost|^127\./.test(host) ? 'http' : 'https');
  const match = core.matchEngine(ENGINES, RULES, year, model, decoded);
  const params = new URLSearchParams();
  if (vin) params.set('vin', vin);
  params.set('year', year);
  params.set('model', model);
  if (miles != null) params.set('miles', miles);
  if (price != null) params.set('price', price);
  if (match.code) params.set('engine', match.code);
  const out = {
    status: match.code ? 'ok' : 'pick-engine',
    car: { vin: vin || null, year, model, name: year + ' BMW ' + model, body: decoded ? decoded.body : '' },
    engine: null,
    engineHint: match.hint,
    miles, price,
    reportUrl: proto + '://' + host + '/check?' + params.toString()
  };

  if (match.code) {
    const engine = core.engineByCode(ENGINES, match.code);
    const items = core.classify(engine, miles);
    const counted = {};
    items.forEach((it) => { counted[it.index] = core.defaultCounted(it); });
    const sums = core.totals(items, counted);
    out.engine = { code: engine.code, desc: engine.desc, risk: engine.risk, guide: proto + '://' + host + '/engines/' + engine.code.toLowerCase() };
    out.verdict = core.verdictFor(items, counted, price);
    out.workDue = sums.total;
    out.unpriced = sums.unpriced;
    out.offer = core.offerFor(price, sums.total);
    out.due = items.filter((it) => counted[it.index]).map((it) => ({
      name: it.p.name, cost: core.costText(it.p.shop_cost_usd), severity: it.p.severity
    }));
    out.soon = items.filter((it) => it.status === 'soon').map((it) => it.p.name);
    out.anyMileage = core.criticalAnyMileage(items, counted).map((it) => ({ name: it.p.name, cost: core.costText(it.p.shop_cost_usd) }));
  }

  try {
    const recalls = await fetchRecalls('BMW', core.recallModel(model), year);
    out.recalls = { count: recalls.length, items: recalls.slice(0, 5).map((r) => ({ campaign: r.campaign, component: r.component })) };
  } catch (err) {
    out.recalls = null;
  }

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).json(out);
};
