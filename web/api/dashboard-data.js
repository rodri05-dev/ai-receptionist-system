const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
   if (!process.env.DASHBOARD_ACCESS_TOKEN || token !== process.env.DASHBOARD_ACCESS_TOKEN) {
  return res.status(401).json({ error: 'unauthorized' });
}
  const [{ data: missedCalls }, { data: conversations }, { data: pipeline }, { data: activity }] = await Promise.all([
    supabase.from('missed_calls').select('*, contacts(full_name)').order('created_at', { ascending: false }).limit(15),
    supabase.from('conversations').select('id, channel, intent, status, updated_at, contacts(full_name, phone, email)').order('updated_at', { ascending: false }).limit(15),
    supabase.from('contacts').select('id, full_name, phone, email, service_interest, status, qualification_score').order('updated_at', { ascending: false }).limit(50),
    supabase.from('business_activity').select('*, contacts(full_name)').order('created_at', { ascending: false }).limit(20)
  ]);

  res.status(200).json({ missedCalls, conversations, pipeline, activity });
};