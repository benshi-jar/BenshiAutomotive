// Calls to NHTSA's free public services, shared by the /api functions.
// Files under api/_lib are helpers: Vercel does not serve them as endpoints.

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

function clean(value) {
  if (value === undefined || value === null) return '';
  const text = String(value).trim();
  return text === 'Not Applicable' ? '' : text;
}

// Decode a VIN with vPIC. Throws if the service does not answer.
async function decodeVin(vin) {
  const url = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/' + vin + '?format=json';
  const upstream = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!upstream.ok) throw new Error('vPIC returned ' + upstream.status);
  const body = await upstream.json();
  const row = (body.Results && body.Results[0]) || {};
  return {
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
}

// Recalls for a make, model and model year. Throws if the service does not answer.
async function fetchRecalls(make, model, year) {
  const url = 'https://api.nhtsa.gov/recalls/recallsByVehicle?make=' + encodeURIComponent(make) +
    '&model=' + encodeURIComponent(model) + '&modelYear=' + year;
  const upstream = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!upstream.ok) throw new Error('NHTSA returned ' + upstream.status);
  const body = await upstream.json();
  return (body.results || []).map((r) => ({
    campaign: r.NHTSACampaignNumber || '',
    date: r.ReportReceivedDate || '',
    component: r.Component || '',
    summary: r.Summary || '',
    remedy: r.Remedy || ''
  }));
}

module.exports = { VIN_PATTERN, decodeVin, fetchRecalls };
