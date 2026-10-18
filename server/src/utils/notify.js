// नोटिफिकेशन सेवा: App (DB) + Web Push + WhatsApp Cloud API.
// WHATSAPP_TOKEN नसल्यास WhatsApp मेसेज फक्त console मध्ये लॉग होतो.
import { q, now } from '../db.js';
import { config } from '../config.js';
import { sendPush } from './push.js';
import { signAction } from './tokens.js';
import { emit } from '../live.js';

const WA_URL = () => `https://graph.facebook.com/v20.0/${config.whatsappPhoneId}/messages`;

export async function sendWhatsApp(mobile, text, document) {
  if (!config.whatsappToken || !config.whatsappPhoneId) {
    console.log(`[WhatsApp → ${mobile}] ${text.replace(/\n/g, ' | ')}${document ? ` [PDF: ${document.link}]` : ''}`);
    return;
  }
  const body = document
    ? { messaging_product: 'whatsapp', to: `91${mobile}`, type: 'document', document: { link: document.link, filename: document.filename, caption: text } }
    : { messaging_product: 'whatsapp', to: `91${mobile}`, type: 'text', text: { body: text, preview_url: true } };
  try {
    const res = await fetch(WA_URL(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.whatsappToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error('WhatsApp पाठवताना त्रुटी:', res.status, await res.text());
  } catch (e) {
    console.error('WhatsApp पाठवताना त्रुटी:', e.message);
  }
}

// quick = { kind: 'application' | 'grievance_review', id } असल्यास WhatsApp मध्ये एका-क्लिक मंजुरी लिंक जाते
export function notify(userId, title, message, link, { quick } = {}) {
  if (!userId) return;
  q.run('INSERT INTO notifications (user_id, channel, title, message, link, created_at) VALUES (?,?,?,?,?,?)',
    userId, 'app', title, message, link, now());
  sendPush(userId, { title, body: message, url: link || '/' }).catch(() => {});
  emit('notification', { title, message, link }, `user:${userId}`);
  const user = q.get('SELECT mobile FROM users WHERE id = ?', userId);
  if (user?.mobile) {
    let text = `*${title}*\n${message}`;
    if (quick) text += `\n\n✅ एका क्लिकवर मंजूर / नामंजूर करा:\n${config.appUrl}/q/${signAction(userId, quick.kind, quick.id)}`;
    else if (link) text += `\n${config.appUrl}${link}`;
    sendWhatsApp(user.mobile, text);
  }
}

export function notifyRole(role, title, message, link) {
  for (const u of q.all('SELECT id FROM users WHERE role = ? AND active = 1', role)) notify(u.id, title, message, link);
}
