// Web Push Notifications (मोबाईल/डेस्कटॉप ब्राउझरवर अ‍ॅप बंद असतानाही सूचना)
// VAPID keys .env मध्ये नसल्यास data/vapid.json मध्ये एकदाच तयार होतात.
import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import { config } from '../config.js';
import { q } from '../db.js';

function loadKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const file = path.join(path.dirname(config.dbFile), 'vapid.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(file, JSON.stringify(keys));
  return keys;
}

const keys = loadKeys();
webpush.setVapidDetails(`mailto:${process.env.VAPID_EMAIL || 'admin@mnp.local'}`, keys.publicKey, keys.privateKey);
export const vapidPublicKey = keys.publicKey;

export async function sendPush(userId, payload) {
  for (const s of q.all('SELECT id, subscription FROM push_subscriptions WHERE user_id = ?', userId)) {
    try {
      await webpush.sendNotification(JSON.parse(s.subscription), JSON.stringify(payload));
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) q.run('DELETE FROM push_subscriptions WHERE id = ?', s.id); // subscription कालबाह्य
      else console.error('Push त्रुटी:', e.message);
    }
  }
}
