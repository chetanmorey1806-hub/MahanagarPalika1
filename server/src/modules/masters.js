// मास्टर डेटा: वॉर्ड, विभाग, तक्रार प्रकार, कर्मचारी
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q, audit } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const r = Router();

// सार्वजनिक (नागरिक तक्रार फॉर्मसाठी)
r.get('/public', (req, res) => {
  res.json({
    wards: q.all('SELECT id, name FROM wards ORDER BY id'),
    categories: q.all(`SELECT c.id, c.code, c.name, c.icon, c.sla_hours, d.name AS department_name
      FROM categories c JOIN departments d ON d.id = c.department_id ORDER BY c.id`),
  });
});

r.use(requireAuth);

r.get('/', (req, res) => {
  res.json({
    wards: q.all('SELECT * FROM wards ORDER BY id'),
    departments: q.all('SELECT * FROM departments ORDER BY id'),
    categories: q.all('SELECT * FROM categories ORDER BY id'),
  });
});

r.get('/users', requireRole('clerk', 'officer', 'admin'), (req, res) => {
  const where = [];
  const params = [];
  if (req.user.role === 'officer' || req.user.role === 'clerk') {
    where.push('u.department_id = ?'); params.push(req.user.department_id);
    if (req.user.ward_id) { where.push('u.ward_id = ?'); params.push(req.user.ward_id); }
  }
  if (req.query.role) { where.push('u.role = ?'); params.push(req.query.role); }
  res.json(q.all(`SELECT u.id, u.name, u.mobile, u.email, u.role, u.designation, u.ward_id, u.department_id, u.active,
      w.name AS ward_name, d.name AS department_name
    FROM users u LEFT JOIN wards w ON w.id = u.ward_id LEFT JOIN departments d ON d.id = u.department_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY u.role, u.name`, ...params));
});

// फाईल पुढे पाठवण्यासाठी सर्व अधिकाऱ्यांची यादी
r.get('/officers', requireRole('clerk', 'officer', 'admin'), (req, res) => {
  res.json(q.all(`SELECT u.id, u.name, u.role, u.designation, d.name AS department_name, w.name AS ward_name
    FROM users u LEFT JOIN departments d ON d.id = u.department_id LEFT JOIN wards w ON w.id = u.ward_id
    WHERE u.active = 1 AND u.role IN ('clerk','officer','admin') ORDER BY u.role = 'admin' DESC, u.role = 'clerk', u.ward_id IS NOT NULL, u.name`));
});

r.post('/users', requireRole('admin'), (req, res) => {
  const { name, mobile, email, password, role, designation, ward_id, department_id, employee_code, basic_pay, joining_date } = req.body || {};
  if (!name || !/^\d{10}$/.test(mobile || '') || !password || !['worker', 'clerk', 'officer', 'admin'].includes(role)) {
    return res.status(400).json({ message: 'नाव, १० अंकी मोबाईल, पासवर्ड व भूमिका आवश्यक आहे' });
  }
  if (q.get('SELECT id FROM users WHERE mobile = ?', mobile)) return res.status(409).json({ message: 'हा मोबाईल नंबर आधीच नोंदवलेला आहे' });
  const info = q.run('INSERT INTO users (name, mobile, email, password_hash, role, designation, ward_id, department_id) VALUES (?,?,?,?,?,?,?,?)',
    name, mobile, email || null, bcrypt.hashSync(password, 10), role, designation, ward_id || null, department_id || null);
  q.run('UPDATE users SET employee_code = ?, basic_pay = ?, joining_date = ? WHERE id = ?', employee_code || null, Number(basic_pay) || null, joining_date || null, Number(info.lastInsertRowid));
  audit(req.user.id, 'create_user', 'user', Number(info.lastInsertRowid));
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

r.patch('/users/:id', requireRole('admin'), (req, res) => {
  const u = q.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!u) return res.status(404).json({ message: 'कर्मचारी सापडला नाही' });
  const b = req.body || {};
  q.run('UPDATE users SET name=?, role=?, designation=?, ward_id=?, department_id=?, active=? WHERE id=?',
    b.name ?? u.name, b.role ?? u.role, b.designation ?? u.designation,
    b.ward_id !== undefined ? b.ward_id || null : u.ward_id,
    b.department_id !== undefined ? b.department_id || null : u.department_id,
    b.active !== undefined ? (b.active ? 1 : 0) : u.active, u.id);
  if (b.basic_pay !== undefined) q.run('UPDATE users SET basic_pay = ? WHERE id = ?', Number(b.basic_pay) || null, u.id);
  if (b.employee_code !== undefined) q.run('UPDATE users SET employee_code = ? WHERE id = ?', b.employee_code || null, u.id);
  if (b.email !== undefined) q.run('UPDATE users SET email = ? WHERE id = ?', b.email || null, u.id);
  if (b.password) q.run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(b.password, 10), u.id);
  audit(req.user.id, 'update_user', 'user', u.id);
  res.json({ ok: true });
});

r.patch('/wards/:id', requireRole('admin'), (req, res) => {
  const { name, lat, lng, radius_m, boundary } = req.body || {};
  const w = q.get('SELECT * FROM wards WHERE id = ?', req.params.id);
  if (!w) return res.status(404).json({ message: 'वॉर्ड सापडला नाही' });
  let boundaryJson = w.boundary;
  if (boundary !== undefined) {
    if (!boundary) boundaryJson = null;
    else {
      // GeoJSON Polygon coordinates: [[[lng,lat], ...]] — किमान ४ बिंदू, पहिला = शेवटचा
      let poly;
      try { poly = typeof boundary === 'string' ? JSON.parse(boundary) : boundary; } catch { poly = null; }
      const ring = Array.isArray(poly) && poly[0];
      const ok = Array.isArray(ring) && ring.length >= 4 && ring.every((c) => Array.isArray(c) && c.length === 2 && c.every(Number.isFinite));
      if (!ok) return res.status(400).json({ message: 'हद्द चुकीची आहे — GeoJSON Polygon coordinates [[[lng,lat],...]] द्या (किमान ४ बिंदू)' });
      boundaryJson = JSON.stringify(poly);
    }
  }
  q.run('UPDATE wards SET name=?, lat=?, lng=?, radius_m=?, boundary=? WHERE id=?',
    name ?? w.name, lat ?? w.lat, lng ?? w.lng, radius_m ?? w.radius_m, boundaryJson, w.id);
  res.json({ ok: true });
});

r.patch('/categories/:id', requireRole('admin'), (req, res) => {
  const { sla_hours } = req.body || {};
  if (!(sla_hours > 0)) return res.status(400).json({ message: 'SLA तास योग्य भरा' });
  q.run('UPDATE categories SET sla_hours = ? WHERE id = ?', sla_hours, req.params.id);
  res.json({ ok: true });
});

export default r;
