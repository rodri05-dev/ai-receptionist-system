const twilio = require('twilio');
const { getOrCreateConversation, runAgentTurn } = require('../../lib/agent');
const { allow, keyFor } = require('../../lib/ratelimit');

const VoiceResponse = twilio.twiml.VoiceResponse;
const SAY = { voice: 'Polly.Joanna', language: 'en-US' };

function listen(twiml, prompt) {
  const g = twiml.gather({
    input: 'speech', action: '/api/voice/handle-speech', method: 'POST',
    speechTimeout: 'auto', speechModel: 'phone_call', enhanced: true, language: 'en-US'
  });
  g.say(SAY, prompt);
  twiml.say(SAY, "I didn't hear anything. Goodbye.");
  twiml.hangup();
}

module.exports = async (req, res) => {
  const { CallSid, SpeechResult, From } = req.body;
  const twiml = new VoiceResponse();
  res.setHeader('Content-Type', 'text/xml');

  try {
    if (!(await allow(keyFor(From, 'phone'), { limit: 30, windowSeconds: 600 }))) {
      twiml.say(SAY, "We're getting a lot of calls right now — please try again in a few minutes. Goodbye.");
      twiml.hangup();
      return res.status(200).send(twiml.toString());
    }

    if (!SpeechResult || !SpeechResult.trim()) {
      listen(twiml, "Sorry, I didn't catch that. Could you say that again?");
      return res.status(200).send(twiml.toString());
    }

    const convo = await getOrCreateConversation('phone', CallSid, From);
    const parsed = await runAgentTurn({ convo, userText: SpeechResult, leadSource: 'phone' });

    if (parsed.intent === 'transfer_human' && process.env.OWNER_FORWARD_NUMBER) {
      twiml.say(SAY, parsed.reply);
      twiml.dial(process.env.OWNER_FORWARD_NUMBER);
    } else if (parsed.intent === 'end_conversation') {
      twiml.say(SAY, parsed.reply);
      twiml.hangup();
    } else {
      listen(twiml, parsed.reply);
    }
  } catch (e) {
    console.error('phone turn failed:', e);
    twiml.say(SAY, "Sorry, we're having a technical problem. We'll follow up by text. Goodbye.");
    twiml.hangup();
  }

  res.status(200).send(twiml.toString());
};