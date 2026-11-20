// Looks up NHTSA safety recalls for a make, model and model year.
// Runs on Vercel as a serverless function at /api/recalls?model=335i&year=2013

module.exports = async (req, res) => {
  const q = req.query || {};
  const make = String(q.make || 'BMW').trim();
  const model = String(q.model || '').trim();
  const year = parseInt(q.year, 10);
  if (!model || !/^[A-Za-z0-9 \-]{1,30}$/.test(model) || !(year >= 1990 && year <= 2035)) {
    res.status(400).json({ error: 'Need a model and a model year.' });
    return;
  }
  try {
    const url = 'https://api.nhtsa.gov/recalls/recallsByVehicle?make=' + encodeURIComponent(make) +
      '&model=' + encodeURIComponent(model) + '&modelYear=' + year;
    const upstream = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!upstream.ok) throw new Error('NHTSA returned ' + upstream.status);
    const body = await upstream.json();
    const recalls = (body.results || []).map((r) => ({
      campaign: r.NHTSACampaignNumber || '',
      date: r.ReportReceivedDate || '',
      component: r.Component || '',
      summary: r.Summary || '',
      remedy: r.Remedy || ''
    }));
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json({ make, model, year, count: recalls.length, recalls });
  } catch (err) {
    res.status(502).json({ error: 'The recall service did not answer.' });
  }
};
