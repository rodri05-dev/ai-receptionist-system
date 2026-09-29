const { createClient } = require('@supabase/supabase-js');
const { groqChat } = require('../../lib/groq');
const { logCallActivity } = require('../../lib/hubspot');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;
  if (CallStatus !== 'completed') return res.status(200).end();

  const { data: convo } = await supabase.from('conversations')
    .select('*, contacts(hubspot_contact_id)').eq('channel', 'phone').eq('external_id', CallSid).maybeSingle();
  if (!convo || !convo.transcript?.length) return res.status(200).end();

  const summary = await groqChat([
    { role: 'system', content: 'Summarize this phone call in 2 sentences for a business owner to read before calling back. Be concrete about what the caller wants.' },
    { role: 'user', content: JSON.stringify(convo.transcript) }
  ]).catch(() => '');

  await supabase.from('business_activity').insert({
    activity_type: 'call_handled', contact_id: convo.contact_id, details: { summary, duration: CallDuration }
  });

  if (convo.contacts?.hubspot_contact_id && summary) {
    await logCallActivity(convo.contacts.hubspot_contact_id, summary).catch(e => console.error('HubSpot call log failed:', e));
  }

  res.status(200).end();
};