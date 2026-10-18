// नागरिकांचा संवेदनशील डेटा (मोबाईल नंबर इ.) AES-256-GCM ने encrypt करून साठवला जातो.
import crypto from 'node:crypto';
import { config } from '../config.js';

let key;
if (/^[0-9a-f]{64}$/i.test(config.encryptionKey)) {
  key = Buffer.from(config.encryptionKey, 'hex');
} else {
  console.warn('⚠️  DATA_ENCRYPTION_KEY सेट नाही — development key वापरत आहे');
  key = crypto.createHash('sha256').update('mnp-dev-key').digest();
}

export function encrypt(plain) {
  if (plain == null || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload) {
  if (!payload) return null;
  try {
    const [iv, tag, enc] = payload.split('.').map((s) => Buffer.from(s, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function maskMobile(m) {
  return m ? m.replace(/^(\d{2})\d+(\d{2})$/, '$1******$2') : m;
}

export function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}
