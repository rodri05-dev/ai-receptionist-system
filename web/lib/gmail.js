const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_ADDRESS, pass: process.env.GMAIL_APP_PASSWORD }
});

async function sendEmail({ to, subject, body }) {
  await transporter.sendMail({ from: process.env.GMAIL_ADDRESS, to, subject, text: body });
}

module.exports = { sendEmail };