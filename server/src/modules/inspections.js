// अधिकाऱ्यांच्या क्षेत्रीय तपासणी भेटी (Scheduled Field Inspections)
import { Router } from 'express';
import { q, now, today } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { saveDataUrl } from '../utils/files.js';

const r = Router();
r.use(requireAuth, requireRole('officer', 'admin'));

const SELECT = `SELECT i.*, u.name AS officer_name, u.designation, w.name AS ward_name FROM inspections i
  JOIN users u ON u.id = i.officer_id LEFT JOIN wards w ON w.id = i.ward_id`;

r.get('/', (req, res) => {
  const { when = 'upcoming' } = req.query;
  const params = [];
  let where = req.user.role === 'admin' && req.query.all === '1' ? '1=1' : 'i.officer_id = ?';
  if (where !== '1=1') params.push(req.user.id);
  if (when === 'today') { where += " AND i.scheduled_date = ? AND i.status = 'scheduled'"; params.push(today()); }
  else if (when === 'upcoming') { where += " AND i.scheduled_date >= ? AND i.status = 'scheduled'"; params.push(today()); }
  else if (when === 'done') where += " AND i.status = 'done'";
  else if (when === 'missed') { where += " AND i.scheduled_date < ? AND i.status = 'scheduled'"; params.push(today()); }
  res.json(q.all(`${SELECT} WHERE ${where} ORDER BY i.scheduled_date ${when === 'done' ? 'DESC' : 'ASC'}, i.scheduled_time LIMIT 200`, ...params));
});

r.post('/', (req, res) => {
  const { title, purpose, location, lat, lng, ward_id, scheduled_date, scheduled_time } = req.body || {};
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(scheduled_date || '')) return res.status(400).json({ message: 'विषय व तारीख आवश्यक' });
  const id = Number(q.run(`INSERT INTO inspections (officer_id, title, purpose, location, lat, lng, ward_id, scheduled_date, scheduled_time, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, req.user.id, title, purpose, location, lat, lng, ward_id || req.user.ward_id, scheduled_date, scheduled_time || null, now()).lastInsertRowid);
  res.status(201).json({ id });
});

r.post('/:id/done', (req, res, next) => {
  try {
    const i = q.get('SELECT * FROM inspections WHERE id = ?', req.params.id);
    if (!i || (i.officer_id !== req.user.id && req.user.role !== 'admin')) return res.status(404).json({ message: 'भेट सापडली नाही' });
    const { findings, photo, meta } = req.body || {};
    if (!findings?.trim()) return res.status(400).json({ message: 'तपासणीत काय आढळले ते लिहा / बोला' });
    q.run("UPDATE inspections SET status = 'done', findings = ?, photo = ?, photo_meta = ?, lat = COALESCE(?, lat), lng = COALESCE(?, lng), done_at = ? WHERE id = ?",
      findings.trim(), photo ? saveDataUrl(photo, 'inspections') : null, JSON.stringify(meta || {}), meta?.lat, meta?.lng, now(), i.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.post('/:id/cancel', (req, res) => {
  q.run("UPDATE inspections SET status = 'cancelled' WHERE id = ? AND (officer_id = ? OR ? = 'admin')", req.params.id, req.user.id, req.user.role);
  res.json({ ok: true });
});

export default r;
