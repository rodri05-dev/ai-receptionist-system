const twilio = require('twilio');
const { createClient } = require('@supabase/supabase-js');
const { sendSms } = require('../../lib/sms');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const VoiceResponse = twilio.twiml.VoiceResponse;
const SAY = { voice: 'Polly.Joanna', language: 'en-US' };

module.exports = async (req, res) => {
  const { CallSid, From, DialCallStatus } = req.body;
  const twiml = new VoiceResponse();
  res.setHeader('Content-Type', 'text/xml');

  if (DialCallStatus === 'completed') {
    twiml.hangup(); // someone answered and the call already happened
    return res.status(200).send(twiml.toString());
  }

  try {
    await supabase.from('missed_calls').insert({ twilio_call_sid: CallSid, caller_phone: From, dial_status: DialCallStatus, texted: true });
    const text = process.env.BUSINESS_SMS_GREETING
      || `Hi! Sorry we missed your call — this is ${process.env.BUSINESS_NAME}'s assistant. What can I help with?`;
    await sendSms({ to: From, body: text }).catch(e => console.error('missed-call sms failed:', e));
  } catch (e) {
    console.error('dial-status logging failed:', e);
  }

  const g = twiml.gather({
    input: 'speech', action: '/api/voice/handle-speech', method: 'POST',
    speechTimeout: 'auto', speechModel: 'phone_call', enhanced: true, language: 'en-US'
  });
  g.say(SAY, "Sorry we missed you! I just texted you, and I can help right now too — what's going on?");
  twiml.say(SAY, "I've texted you — talk soon. Goodbye.");
  twiml.hangup();
  res.status(200).send(twiml.toString());
};