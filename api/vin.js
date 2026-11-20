// Decodes a VIN with NHTSA's free vPIC service and returns the few fields the checker needs.
// Runs on Vercel as a serverless function at /api/vin?vin=...

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

function clean(value) {
  if (value === undefined || value === null) return '';
  const text = String(value).trim();
  return text === 'Not Applicable' ? '' : text;
}

module.exports = async (req, res) => {
  const vin = String((req.query && req.query.vin) || '').trim().toUpperCase();
  if (!VIN_PATTERN.test(vin)) {
    res.status(400).json({ error: 'A VIN is 17 letters and numbers, and never uses I, O or Q.' });
    return;
  }
  try {
    const url = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/' + vin + '?format=json';
    const upstream = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!upstream.ok) throw new Error('vPIC returned ' + upstream.status);
    const body = await upstream.json();
    const row = (body.Results && body.Results[0]) || {};
    const result = {
      vin,
      make: clean(row.Make),
      model: clean(row.Model),
      series: clean(row.Series),
      trim: clean(row.Trim),
      year: parseInt(row.ModelYear, 10) || null,
      displacement: clean(row.DisplacementL),
      cylinders: clean(row.EngineCylinders),
      engineModel: clean(row.EngineModel),
      body: clean(row.BodyClass),
      errorText: clean(row.ErrorText)
    };
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json(result);
  } catch (err) {
    res.status(502).json({ error: 'The VIN lookup service did not answer. Enter the year and model instead.' });
  }
};
