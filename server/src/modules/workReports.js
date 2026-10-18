// कर्मचाऱ्यांचे दैनंदिन काम-रिपोर्ट (मराठी Voice-to-Text किंवा टाइप करून)
import { Router } from 'express';
import { q, now } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { saveDataUrl } from '../utils/files.js';

const r = Router();
r.use(requireAuth);

r.post('/', (req, res, next) => {
  try {
    const { text, via_voice, photo, lat, lng, capturedAt } = req.body || {};
    if (!text?.trim()) return res.status(400).json({ message: 'रिपोर्ट रिकामा आहे — माईक दाबून बोला किंवा लिहा' });
    const at = capturedAt && Math.abs(Date.now() - Date.parse(capturedAt)) < 864e5 ? new Date(capturedAt).toISOString() : now();
    const info = q.run('INSERT INTO work_reports (user_id, ward_id, text, via_voice, photo, lat, lng, created_at) VALUES (?,?,?,?,?,?,?,?)',
      req.user.id, req.user.ward_id, text.trim().slice(0, 2000), via_voice ? 1 : 0, photo ? saveDataUrl(photo, 'reports') : null, lat, lng, at);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  } catch (e) { next(e); }
});

r.get('/my', (req, res) => {
  res.json(q.all('SELECT * FROM work_reports WHERE user_id = ? ORDER BY id DESC LIMIT 30', req.user.id));
});

r.get('/', requireRole('officer', 'admin'), (req, res) => {
  const where = ['1=1'];
  const params = [];
  if (req.user.role === 'officer') {
    where.push('u.department_id = ?'); params.push(req.user.department_id);
    if (req.user.ward_id) { where.push('wr.ward_id = ?'); params.push(req.user.ward_id); }
  }
  if (req.query.date) { where.push("date(wr.created_at, '+330 minutes') = ?"); params.push(req.query.date); }
  res.json(q.all(`SELECT wr.*, u.name, u.designation, w.name AS ward_name FROM work_reports wr JOIN users u ON u.id = wr.user_id
    LEFT JOIN wards w ON w.id = wr.ward_id WHERE ${where.join(' AND ')} ORDER BY wr.id DESC LIMIT 200`, ...params));
});

export default r;
