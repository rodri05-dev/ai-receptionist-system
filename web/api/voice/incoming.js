const twilio = require('twilio');
const { createClient } = require('@supabase/supabase-js');
const { isBusinessHours } = require('../../lib/hours');
const { sendSms } = require('../../lib/sms');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const VoiceResponse = twilio.twiml.VoiceResponse;
const SAY = { voice: 'Polly.Joanna', language: 'en-US' };

function gatherAI(twiml, prompt) {
  const g = twiml.gather({
    input: 'speech', action: '/api/voice/handle-speech', method: 'POST',
    speechTimeout: 'auto', speechModel: 'phone_call', enhanced: true, language: 'en-US'
  });
  g.say(SAY, prompt);
  twiml.say(SAY, "I didn't hear anything — please call back anytime. Goodbye.");
  twiml.hangup();
}

async function fireMissedCallFlow({ CallSid, From }) {
  await supabase.from('missed_calls').insert({ twilio_call_sid: CallSid, caller_phone: From, texted: true });
  const text = process.env.BUSINESS_SMS_GREETING
    || `Hi! Sorry we missed your call — this is ${process.env.BUSINESS_NAME}'s assistant. What can I help with?`;
  await sendSms({ to: From, body: text }).catch(e => console.error('missed-call sms failed:', e));
}

module.exports = async (req, res) => {
  const { CallSid, From } = req.body;
  const twiml = new VoiceResponse();
  res.setHeader('Content-Type', 'text/xml');

  const mode = process.env.CALL_MODE || 'carrier_forwarded';
  const hours = isBusinessHours();

  try {
    if (mode === 'carrier_forwarded') {
      // Every call that reaches this number already went unanswered at the real
      // number — the carrier only forwards on no-answer/busy (Step 8.3). So this
      // call IS the missed call; go straight to text-back + a live AI option.
      await fireMissedCallFlow({ CallSid, From });
      gatherAI(twiml, "Sorry we missed you! I just texted you, and I can also help right now — what's going on?");
    } else if (mode === 'dial_first' && process.env.OWNER_FORWARD_NUMBER && (hours || process.env.DIAL_OUTSIDE_HOURS === 'true')) {
      // Recipe B — needs a funded (non-trial) Twilio account, see Step 8.6.
      const dial = twiml.dial({ action: '/api/voice/dial-status', method: 'POST', timeout: Number(process.env.DIAL_TIMEOUT_SECONDS || 18) });
      dial.number(process.env.OWNER_FORWARD_NUMBER);
    } else {
      // always_ai, or dial_first outside business hours with nobody to ring.
      const greeting = hours
        ? `Thanks for calling ${process.env.BUSINESS_NAME}. What can I help you with?`
        : `Thanks for calling ${process.env.BUSINESS_NAME}. We're closed right now, but I can still help — what's going on?`;
      gatherAI(twiml, greeting);
    }
  } catch (e) {
    console.error('incoming call failed:', e);
    twiml.say(SAY, "Sorry, we're having a technical issue. Please try again shortly.");
    twiml.hangup();
  }

  res.status(200).send(twiml.toString());
};