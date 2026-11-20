// Run with: node tests/report-core.test.js
const assert = require('assert');
const core = require('../report-core.js');
const ENGINES = require('../data/engines.json');
const RULES = require('../data/models.json').rules;

function report(code, miles, asking) {
  const engine = core.engineByCode(ENGINES, code);
  const items = core.classify(engine, miles);
  const counted = {};
  items.forEach((it) => { counted[it.index] = core.defaultCounted(it); });
  const sums = core.totals(items, counted);
  return { verdict: core.verdictFor(items, counted, asking).label, total: sums.total, offer: core.offerFor(asking, sums.total), unpriced: sums.unpriced };
}

// Engine matching
const f30 = { model: '328i', series: '3-Series', trim: '', displacement: '2.0', cylinders: '4', engineModel: '' };
const e92 = { model: '328i', series: '3-Series', trim: '', displacement: '3.0', cylinders: '6', engineModel: '' };
assert.strictEqual(core.matchEngine(ENGINES, RULES, 2013, '328i', f30).code, 'N20');
assert.strictEqual(core.matchEngine(ENGINES, RULES, 2012, '328i', e92).code, 'N52');
assert.strictEqual(core.matchEngine(ENGINES, RULES, 2012, '328i', null).code, '');
assert.strictEqual(core.matchEngine(ENGINES, RULES, 2014, '535i', { engineModel: 'N55B30' }).code, 'N55');
assert.strictEqual(core.matchEngine(ENGINES, RULES, 2016, 'X5 xDrive35i', null).code, 'N55');
assert.strictEqual(core.matchEngine(ENGINES, RULES, 2018, '5 Series 540i Sedan RWD', null).code, 'B58');
assert.strictEqual(core.matchEngine(ENGINES, RULES, 2012, 'M5', null).code, '');
assert.strictEqual(core.engineFromVin(ENGINES, 'B46B20O1'), 'B48');
assert.strictEqual(core.recallModel('X5 xDrive35i'), 'X5');
const recallCases = {
  '3-Series 335i': '335i', '5 Series 540i Sedan RWD': '540i', '540i': '540i', '335 i xDrive': '335i',
  '328i Sedan 4D': '328i', '750Li xDrive': '750li', '335is': '335is', 'M340i xDrive': 'm340i',
  'M3': 'M3', 'Z4 sDrive28i': 'Z4', 'X3 M40i': 'X3', '4 Series 428i Coupe RWD': '428i', '330e': '330e'
};
for (const [input, want] of Object.entries(recallCases)) assert.strictEqual(core.recallModel(input), want, input);

// The 540i from a real CarGurus listing: valve cover counted, coolant unpriced
let r = report('B58', 113546, 14367);
assert.deepStrictEqual(r, { verdict: 'Negotiate', total: 500, offer: 13800, unpriced: ['Coolant loss'] });

// N20 at any mileage: the timing chain decides the verdict, but is not added to the offer
r = report('N20', 60000, 12000);
assert.strictEqual(r.verdict, 'Get proof first');
assert.strictEqual(r.total, 0);

// S65 past 40k: rod bearings are counted and critical
assert.strictEqual(report('S65', 62000, 28000).verdict, 'Get proof or walk');

// N52 at 112k: lifter tick is listed but not taken off the offer (count_by_default: false)
r = report('N52', 112000, 7800);
assert.strictEqual(r.total, 1050);
assert.strictEqual(r.offer, 6700);

// Nothing due on a low-mile B58
assert.strictEqual(report('B58', 20000, 30000).verdict, 'Fair if it checks out');

// Offer rounds down to the nearest $100 and never goes below zero
assert.strictEqual(core.offerFor(14367, 500), 13800);
assert.strictEqual(core.offerFor(1000, 5000), 0);
assert.strictEqual(core.offerFor(null, 500), null);

assert.strictEqual(core.lowerName('Valve cover gasket and PCV'), 'valve cover gasket and PCV');
console.log('all passed');
