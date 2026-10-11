const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
  const secret = process.env.CRON_CHECK_SECRET;
  if (!secret || req.query.secret !== secret) return res.status(401).end();
  const { error } = await supabase.from('contacts').select('id').limit(1);
  res.status(error ? 500 : 200).json({ ok: !error });
};