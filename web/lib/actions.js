const { createClient } = require('@supabase/supabase-js');
const { bookMeeting } = require('./booking');
const { scoreLead } = require('./qualify');
const { sendEmail } = require('./gmail');
const { createOrUpdateContact } = require('./hubspot');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function handleAgentAction({ contactId, intent, data = {} }) {
  try {
    if (intent === 'booking') return await handleBookMeeting({ contactId, data });
    if (intent === 'new_lead') return await handleQualifyLead({ contactId, data });
    return { skipped: true };
  } catch (e) {
    console.error(`handleAgentAction(${intent}) failed:`, e);
    await sendEmail({
      to: process.env.OWNER_EMAIL,
      subject: `AI receptionist action failed: ${intent}`,
      body: `Nothing was lost — the conversation is saved. Error: ${e.message}\n\nCollected:\n${JSON.stringify(data, null, 2)}`
    }).catch(() => {});
    return { error: e.message };
  }
}

async function handleBookMeeting({ contactId, data }) {
  const result = await bookMeeting({
    attendeeName: data.attendeeName, attendeeEmail: data.attendeeEmail,
    startTimeIso: data.chosenStartTimeIso, notes: data.notes || data.serviceInterest
  });
  const booked = result.mode === 'booked';
  await supabase.from('contacts').update({ status: booked ? 'meeting_booked' : 'qualified' }).eq('id', contactId);

  await sendEmail({
    to: process.env.OWNER_EMAIL,
    subject: booked ? `Booked: ${data.attendeeName}` : `Booking request (please confirm by hand): ${data.attendeeName}`,
    body: booked
      ? `Confirmed via Cal.com.\n\nWith: ${data.attendeeName} (${data.attendeeEmail})\nTime: ${data.chosenStartTimeIso}\nNotes: ${data.notes || '—'}`
      : `The AI couldn't complete this automatically (${result.reason}) and told them you'd confirm by phone or text.\n\nName: ${data.attendeeName}\nEmail: ${data.attendeeEmail}\nPreferred: ${data.chosenStartTimeIso || data.preferredTimes || 'not specified'}\nNotes: ${data.notes || '—'}`
  });

  await supabase.from('business_activity').insert({ activity_type: 'meeting_booked', contact_id: contactId, details: { mode: result.mode } });
  return { ok: true, mode: result.mode };
}

async function handleQualifyLead({ contactId, data }) {
  const score = scoreLead(data);
  await supabase.from('contacts').update({
    qualification_score: score, status: 'qualified',
    service_interest: data.serviceInterest || null, details: data, updated_at: new Date().toISOString()
  }).eq('id', contactId);

  const { data: contact } = await supabase.from('contacts').select('*').eq('id', contactId).single();

  if (contact?.email || contact?.phone) {
    await createOrUpdateContact({
      email: contact.email, phone: contact.phone, fullName: contact.full_name,
      serviceInterest: contact.service_interest, qualificationScore: score
    }).then(id => id && supabase.from('contacts').update({ hubspot_contact_id: id }).eq('id', contactId))
      .catch(e => console.error('HubSpot sync failed:', e));
  }

  await sendEmail({
    to: process.env.OWNER_EMAIL,
    subject: `${data.urgent ? 'URGENT lead' : 'New lead'}: ${contact?.full_name || contact?.phone || ''} (score ${score}/100)`,
    body: `Contact: ${contact?.full_name || '—'} / ${contact?.email || '—'} / ${contact?.phone || '—'}\n\nCollected:\n${JSON.stringify(data, null, 2)}`
  });

  await supabase.from('business_activity').insert({ activity_type: 'lead_qualified', contact_id: contactId, details: { score, urgent: !!data.urgent } });
  return { ok: true, score };
}

module.exports = { handleAgentAction };