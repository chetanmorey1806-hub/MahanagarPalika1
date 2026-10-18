// आपत्कालीन व्यवस्थापन: आग, पूर, झाड कोसळणे, इमारत कोसळणे, अपघात, पाईपलाईन फुटणे — थेट लाईव्ह फीड
import { Router } from 'express';
import { q, now } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { findWard } from '../utils/geo.js';
import { saveDataUrl } from '../utils/files.js';
import { notify } from '../utils/notify.js';
import { emit } from '../live.js';

const r = Router();
r.use(requireAuth);

export const EMERGENCY_TYPES = {
  fire: { name: 'आग', icon: '🔥' }, flood: { name: 'पूर / पाणी साचणे', icon: '🌊' }, tree_fall: { name: 'झाड कोसळले', icon: '🌳' },
  building_collapse: { name: 'इमारत / भिंत कोसळली', icon: '🏚️' }, accident: { name: 'अपघात', icon: '🚑' },
  water_main: { name: 'मुख्य पाईपलाईन फुटली', icon: '💥' }, other: { name: 'इतर', icon: '⚠️' },
};

const SELECT = `SELECT e.*, w.name AS ward_name, u.name AS reported_by_name, u.designation AS reported_by_designation,
    (SELECT COUNT(*) FROM emergency_updates x WHERE x.emergency_id = e.id) AS update_count
  FROM emergencies e LEFT JOIN wards w ON w.id = e.ward_id LEFT JOIN users u ON u.id = e.reported_by`;

r.get('/types', (req, res) => res.json(EMERGENCY_TYPES));

r.get('/', (req, res) => {
  const status = req.query.status || 'active';
  const rows = q.all(`${SELECT} WHERE ${status === 'all' ? '1=1' : 'e.status = ?'} ORDER BY e.status = 'active' DESC,
    CASE e.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, e.id DESC LIMIT 100`, ...(status === 'all' ? [] : [status]));
  res.json(rows.map((e) => ({ ...e, type_name: EMERGENCY_TYPES[e.type]?.name, icon: EMERGENCY_TYPES[e.type]?.icon })));
});

r.get('/:id', (req, res) => {
  const e = q.get(`${SELECT} WHERE e.id = ?`, req.params.id);
  if (!e) return res.status(404).json({ message: 'घटना सापडली नाही' });
  e.type_name = EMERGENCY_TYPES[e.type]?.name;
  e.icon = EMERGENCY_TYPES[e.type]?.icon;
  e.updates = q.all(`SELECT x.*, u.name AS user_name, u.designation FROM emergency_updates x LEFT JOIN users u ON u.id = x.user_id
    WHERE x.emergency_id = ? ORDER BY x.id DESC`, e.id);
  res.json(e);
});

// कोणताही कर्मचारी घटना कळवू शकतो — आयुक्त व प्रभाग अधिकाऱ्यांना लगेच सूचना
r.post('/', (req, res, next) => {
  try {
    const { type, severity, title, description, location, lat, lng, ward_id, photo } = req.body || {};
    if (!EMERGENCY_TYPES[type] || !title) return res.status(400).json({ message: 'घटनेचा प्रकार व शीर्षक आवश्यक' });
    let wardId = ward_id || null;
    if (!wardId && typeof lat === 'number') wardId = findWard(q.all('SELECT * FROM wards'), lat, lng)?.ward.id || null;
    const sev = ['medium', 'high', 'critical'].includes(severity) ? severity : 'high';
    const id = Number(q.run(`INSERT INTO emergencies (type, severity, title, description, location, lat, lng, ward_id, photo, reported_by, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, type, sev, title, description, location, lat, lng, wardId,
    photo ? saveDataUrl(photo, 'emergencies') : null, req.user.id, now()).lastInsertRowid);
    const t = EMERGENCY_TYPES[type];
    const recipients = q.all(`SELECT id FROM users WHERE active = 1 AND id <> ? AND (role = 'admin' OR (role = 'officer' AND (ward_id = ? OR ward_id IS NULL)))`, req.user.id, wardId);
    for (const u of recipients) notify(u.id, `🚨 ${t.icon} आपत्कालीन: ${title}`, `${t.name}${location ? ` — ${location}` : ''} (${sev === 'critical' ? 'अतिगंभीर' : sev === 'high' ? 'गंभीर' : 'मध्यम'})`, `/emergencies?id=${id}`);
    emit('emergency', { id, title, type, severity: sev });
    res.status(201).json({ id });
  } catch (e) { next(e); }
});

r.post('/:id/updates', (req, res) => {
  const e = q.get('SELECT * FROM emergencies WHERE id = ?', req.params.id);
  if (!e) return res.status(404).json({ message: 'घटना सापडली नाही' });
  if (!req.body?.note?.trim()) return res.status(400).json({ message: 'माहिती लिहा' });
  q.run('INSERT INTO emergency_updates (emergency_id, user_id, note, created_at) VALUES (?,?,?,?)', e.id, req.user.id, req.body.note.trim().slice(0, 1000), now());
  emit('emergency', { id: e.id, action: 'update' });
  res.status(201).json({ ok: true });
});

r.post('/:id/resolve', requireRole('officer', 'admin'), (req, res) => {
  const e = q.get('SELECT * FROM emergencies WHERE id = ?', req.params.id);
  if (!e) return res.status(404).json({ message: 'घटना सापडली नाही' });
  q.run("UPDATE emergencies SET status = 'resolved', resolved_at = ? WHERE id = ?", now(), e.id);
  q.run('INSERT INTO emergency_updates (emergency_id, user_id, note, created_at) VALUES (?,?,?,?)', e.id, req.user.id, req.body?.note || '✅ परिस्थिती नियंत्रणात — घटना बंद', now());
  emit('emergency', { id: e.id, action: 'resolved' });
  res.json({ ok: true });
});

export default r;
