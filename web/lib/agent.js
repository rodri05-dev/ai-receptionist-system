const { createClient } = require('@supabase/supabase-js');
const { groqChat, parseAgentJson } = require('./groq');
const { retrieveContext } = require('./kb');
const { buildSystemPrompt } = require('./prompt');
const { handleAgentAction } = require('./actions');
const { getAvailableSlots } = require('./booking');
const { isBusinessHours } = require('./hours');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MEETING_RE = /book|schedul|appointment|meet|come out|come by|estimate|quote/i;
const CLOSING = ['end_conversation', 'transfer_human'];
const CHANNEL_MODE = { phone: 'spoken', sms: 'sms', chat: 'text', voice_web: 'text' };

const withTimeout = (promise, ms, fallback) =>
  Promise.race([promise, new Promise(r => setTimeout(() => r(fallback), ms))]);

async function getOrCreateConversation(channel, externalId, callerPhone = null) {
  const { data: existing } = await supabase
    .from('conversations').select('*').eq('channel', channel).eq('external_id', externalId).maybeSingle();
  if (existing) return existing;
  const { data: created, error } = await supabase
    .from('conversations').insert({ channel, external_id: externalId, caller_phone: callerPhone, transcript: [] }).select().single();
  if (error) throw error;
  return created;
}

// IMPORTANT: external_id is a lookup key, not a phone number — on the phone channel
// it's the Twilio CallSid, which changes every call. The caller's real number only
// ever comes from caller_phone (passed in by the caller when the row is created; see
// handle-speech.js and sms/incoming.js). Chat and web voice have no caller ID at all,
// so there's nobody to attach the conversation to until the agent learns a name,
// email, or phone from what the person actually says.
async function ensureContact(convo, collected = {}, leadSource) {
  if (convo.contact_id) return convo.contact_id;

  const email = collected.email || collected.attendeeEmail;
  const phone = collected.phone || convo.caller_phone || null;
  const fullName = collected.fullName || collected.attendeeName;
  if (!email && !phone && !fullName) return null;

  if (email || phone) {
    const query = supabase.from('contacts').select('id');
    const { data: found } = await (email ? query.eq('email', email) : query.eq('phone', phone)).maybeSingle();
    if (found) {
      await supabase.from('conversations').update({ contact_id: found.id }).eq('id', convo.id);
      convo.contact_id = found.id;
      return found.id;
    }
  }

  const { data: contact, error } = await supabase.from('contacts').insert({
    email: email || null, phone: phone || null, full_name: fullName || null,
    service_interest: collected.serviceInterest || null,
    details: collected, lead_source: leadSource, status: 'new'
  }).select().single();
  if (error || !contact) { console.error('Contact create failed:', error); return null; }

  await supabase.from('conversations').update({ contact_id: contact.id }).eq('id', convo.id);
  convo.contact_id = contact.id;
  return contact.id;
}

async function runAgentTurn({ convo, userText, leadSource }) {
  const kbContext = await withTimeout(retrieveContext(userText), 4000, '');

  let slotContext = '';
  if (MEETING_RE.test(userText) || convo.intent === 'booking') {
    const slots = await withTimeout(getAvailableSlots(), 4000, null);
    slotContext = slots && slots.length
      ? `\nReal open times — offer ONLY from this list, and put the exact ISO string in collected_data.chosenStartTimeIso: ${slots.join(', ')}`
      : `\nOnline booking is unavailable right now. Collect their name, best contact info, and preferred times, then say a person will confirm by phone or text.`;
  }

  const history = convo.transcript || [];
  const messages = [
    {
      role: 'system',
      content: buildSystemPrompt({
        businessName: process.env.BUSINESS_NAME || 'the business',
        servicesSummary: process.env.BUSINESS_SERVICES_SUMMARY || '',
        ragContext: kbContext + slotContext,
        mode: CHANNEL_MODE[convo.channel] || 'text',
        afterHours: !isBusinessHours()
      })
    },
    // last 12 turns — enough context, no runaway token bill on a long-running SMS thread
    ...history.slice(-12).map(h => ({
      role: h.role,
      content: h.role === 'assistant' ? JSON.stringify(h.raw || { reply: h.text }) : h.text
    })),
    { role: 'user', content: userText }
  ];

  const parsed = parseAgentJson(await groqChat(messages, { json: true }));
  const now = new Date().toISOString();
  const transcript = [
    ...history,
    { role: 'user', text: userText, at: now },
    { role: 'assistant', text: parsed.reply, raw: parsed, at: now }
  ];

  const contactId = await ensureContact(convo, parsed.collected_data, leadSource);

  await supabase.from('conversations').update({
    transcript, intent: parsed.intent,
    status: CLOSING.includes(parsed.intent) ? 'closed' : 'active',
    updated_at: now
  }).eq('id', convo.id);

  convo.transcript = transcript;
  convo.intent = parsed.intent;

  if (parsed.ready_to_act && contactId) {
    // Awaited deliberately — Vercel can freeze the function the instant a response is
    // sent, so a fire-and-forget promise here can silently never finish.
    await withTimeout(
      handleAgentAction({ contactId, intent: parsed.intent, data: parsed.collected_data }).catch(e => {
        console.error('Agent action failed:', e); return null;
      }),
      12000, { timedOut: true }
    );
  }

  return parsed;
}

module.exports = { getOrCreateConversation, runAgentTurn };