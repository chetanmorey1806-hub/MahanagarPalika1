// ई-मेल (SMTP). SMTP_HOST नसल्यास मेल फक्त console मध्ये लॉग होतो.
import nodemailer from 'nodemailer';

const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  })
  : null;

export async function sendMail({ to, subject, html, attachments }) {
  if (!to?.length) return;
  if (!transport) {
    console.log(`[Email → ${[].concat(to).join(', ')}] ${subject}${attachments?.length ? ` (+${attachments.length} attachment)` : ''}`);
    return;
  }
  try {
    await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, html, attachments });
  } catch (e) {
    console.error('Email त्रुटी:', e.message);
  }
}
