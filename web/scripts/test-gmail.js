const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { sendEmail } = require('../lib/gmail');

console.log('GMAIL_ADDRESS:', process.env.GMAIL_ADDRESS || 'MISSING');
console.log('GMAIL_APP_PASSWORD length:', (process.env.GMAIL_APP_PASSWORD || '').length, '(must be 16)');
console.log('OWNER_EMAIL:', process.env.OWNER_EMAIL || 'MISSING');

sendEmail({ to: process.env.OWNER_EMAIL, subject: 'Receptionist email test', body: 'If you read this, email works.' })
  .then(() => console.log('✓ Email sent'))
  .catch(e => console.error('✗', e.message));