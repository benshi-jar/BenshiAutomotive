// Run with: node tests/listing-parse.test.js
// Listing texts below are written to look like what you get when you copy a
// page from each site. VINs are made up (with valid check digits).
const assert = require('assert');
const { parseListing, vinCheckDigitOk } = require('../listing-parse.js');

const cases = [
  {
    name: 'Cars.com style',
    text: `Used 2013 BMW 335 i xDrive
94,512 mi.
$13,500
$215/mo est.
Price drop $1,000
Great Deal | $1,240 under market
Long Island BMW
4.7 (1,203 reviews)
23 mi. away
Basics
Exterior color Alpine White
Drivetrain All-wheel Drive
Engine 3.0L I6 24V GDI DOHC Turbo
VIN WBA3B9C50DF000101
Stock # P1234
Mileage 94,512 mi.`,
    want: { vin: 'WBA3B9C50DF000101', miles: 94512, price: 13500, year: 2013, model: '335 i xDrive' }
  },
  {
    name: 'Autotrader style',
    text: `Used 2016 BMW X5 xDrive35i
94,512 miles
$21,995
See estimated payment $389/mo
Vehicle Info
Mileage: 94,512
Drive Type: 4 wheel drive - all wheel drive
Engine: 6-Cylinder Turbo
VIN: 5UXKR0C51G0000202
Fuel Economy: 18 City / 25 Highway
Warranty: 4 yr / 50,000 mi basic`,
    want: { vin: '5UXKR0C51G0000202', miles: 94512, price: 21995, year: 2016, model: 'X5 xDrive35i' }
  },
  {
    name: 'CarGurus style',
    text: `2014 BMW 4 Series 428i Coupe RWD
$14,990
$1,105 below market
Great Deal
Mileage 88,201 mi
Est. $295/mo
VIN: WBA3N7C56EK000303
Fuel economy 23 / 35 mpg
32 mi away from 11779`,
    want: { vin: 'WBA3N7C56EK000303', miles: 88201, price: 14990, year: 2014, model: '4 Series 428i Coupe RWD' }
  },
  {
    name: 'Facebook Marketplace style, no VIN',
    text: `2011 BMW 328i Sedan 4D
$7,800
Listed 3 days ago in Hicksville, NY
About this vehicle
Driven 112,000 miles
Automatic transmission
Exterior color: Black · Interior color: Beige
Clean title
Seller's description
Runs great, new tires. Oil changed every 5,000 miles. Asking $7,800 obo, no lowballs. Original price $9,000.`,
    want: { vin: null, miles: 112000, price: 7800, year: 2011, model: '328i Sedan 4D' }
  },
  {
    name: 'Craigslist style',
    text: `2010 BMW 335i - $9,500 (Long Island)
condition: good
cylinders: 6 cylinders
odometer: 128000
title status: clean
VIN: WBAPM7C55AE000404
2010 bmw 335i sedan. HPFP replaced 2019. $9500 firm.`,
    want: { vin: 'WBAPM7C55AE000404', miles: 128000, price: 9500, year: 2010, model: '335i' }
  },
  {
    name: 'CarMax style, K miles',
    text: `2019 BMW X3 xDrive30i
$27,998*
39K mi
Est. $512/mo
VIN 5UXTR9C58KL000505
Stock # 12345678`,
    want: { vin: '5UXTR9C58KL000505', miles: 39000, price: 27998, year: 2019, model: 'X3 xDrive30i' }
  },
  {
    name: 'Dealer site with MSRP and savings',
    text: `Pre-Owned 2018 BMW 540i xDrive Sedan
MSRP $45,000
Savings $3,000
Sale Price $21,500
Odometer: 61,340
Under 100k miles and one owner!`,
    want: { vin: null, miles: 61340, price: 21500, year: 2018, model: '540i xDrive Sedan' }
  },
  {
    name: 'Nothing useful',
    text: 'Great car, message me for details.',
    want: { vin: null, miles: null, price: null, year: null, model: null }
  }
];

let failed = 0;
for (const c of cases) {
  const got = parseListing(c.text);
  try {
    assert.deepStrictEqual(got, c.want);
    console.log('ok   ' + c.name);
  } catch (e) {
    failed++;
    console.log('FAIL ' + c.name + '\n  want ' + JSON.stringify(c.want) + '\n  got  ' + JSON.stringify(got));
  }
}

assert.ok(vinCheckDigitOk('WBA3B9C50DF000101'));
assert.ok(!vinCheckDigitOk('WBA3B9C51DF000101'));
// A real-looking but wrong check digit still counts as a VIN when nothing better is there.
assert.strictEqual(parseListing('VIN: WBA3B9C51DF000101').vin, 'WBA3B9C51DF000101');
// A BMW VIN wins over a non-BMW one on the same page (for example a "similar cars" strip).
assert.strictEqual(parseListing('Similar: 4T1BF1FK90U000606\nVIN WBA3N7C56EK000303').vin, 'WBA3N7C56EK000303');

// Phrases about mileage that are not the car's mileage.
assert.strictEqual(parseListing('Never driven over 100k miles. Under 90k miles, every 5,000 miles oil.').miles, null);
assert.strictEqual(parseListing('Only 85k miles, under 100k!').miles, 85000);

if (failed) { console.log(failed + ' failed'); process.exit(1); }
console.log('all passed');
