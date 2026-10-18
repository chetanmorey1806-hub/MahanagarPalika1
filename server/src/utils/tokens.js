// WhatsApp / SMS मधील "एका क्लिकवर मंजुरी" लिंकसाठी signed token.
// Token मध्ये अधिकारी, क्रिया व रेकॉर्ड असतो; ४८ तासांनी कालबाह्य.
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const signAction = (userId, kind, id) =>
  jwt.sign({ uid: userId, kind, id, p: 'quick' }, config.jwtSecret, { expiresIn: '48h' });

export function verifyAction(token) {
  const d = jwt.verify(token, config.jwtSecret);
  if (d.p !== 'quick') throw new Error('invalid');
  return d;
}

// दैनिक अहवाल PDF डाऊनलोड लिंक (७ दिवस)
export const signReport = (date) => jwt.sign({ date, p: 'report' }, config.jwtSecret, { expiresIn: '7d' });
export function verifyReport(token) {
  const d = jwt.verify(token, config.jwtSecret);
  if (d.p !== 'report') throw new Error('invalid');
  return d;
}
