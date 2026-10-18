import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { q, audit } from '../db.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, message: { message: 'खूप प्रयत्न झाले, १५ मिनिटांनी पुन्हा करा' } });

function profile(id) {
  return q.get(`SELECT u.id, u.name, u.mobile, u.role, u.designation, u.ward_id, u.department_id,
      w.name AS ward_name, d.name AS department_name, d.code AS department_code
    FROM users u LEFT JOIN wards w ON w.id = u.ward_id LEFT JOIN departments d ON d.id = u.department_id
    WHERE u.id = ?`, id);
}

r.post('/login', loginLimiter, (req, res) => {
  const { mobile, password } = req.body || {};
  const user = q.get('SELECT * FROM users WHERE mobile = ? AND active = 1', String(mobile || '').trim());
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    return res.status(401).json({ message: 'मोबाईल नंबर किंवा पासवर्ड चुकीचा आहे' });
  }
  const token = jwt.sign({ id: user.id, role: user.role }, config.jwtSecret, { expiresIn: '7d' });
  audit(user.id, 'login', 'user', user.id);
  res.json({ token, user: profile(user.id) });
});

r.get('/me', requireAuth, (req, res) => res.json(profile(req.user.id)));

r.post('/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  const user = q.get('SELECT password_hash FROM users WHERE id = ?', req.user.id);
  if (!bcrypt.compareSync(String(oldPassword || ''), user.password_hash)) return res.status(400).json({ message: 'जुना पासवर्ड चुकीचा आहे' });
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ message: 'नवीन पासवर्ड किमान ६ अक्षरांचा हवा' });
  q.run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(newPassword, 10), req.user.id);
  res.json({ ok: true });
});

export default r;
