// Decodes a VIN with NHTSA's free vPIC service and returns the few fields the checker needs.
// Runs on Vercel as a serverless function at /api/vin?vin=...
const { VIN_PATTERN, decodeVin } = require('./_lib/nhtsa.js');

module.exports = async (req, res) => {
  const vin = String((req.query && req.query.vin) || '').trim().toUpperCase();
  if (!VIN_PATTERN.test(vin)) {
    res.status(400).json({ error: 'A VIN is 17 letters and numbers, and never uses I, O or Q.' });
    return;
  }
  try {
    const result = await decodeVin(vin);
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json(result);
  } catch (err) {
    res.status(502).json({ error: 'The VIN lookup service did not answer. Enter the year and model instead.' });
  }
};
