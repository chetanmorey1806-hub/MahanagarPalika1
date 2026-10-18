// वाहन व्यवस्थापन: Real-time GPS, इंधन नोंद, कचरा फेऱ्या
import { Router } from 'express';
import crypto from 'node:crypto';
import { q, now, today } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { checkPing, checkpointStatus } from '../jobs/routeWatch.js';
import { emit } from '../live.js';

const r = Router();

// GPS डिव्हाइस / ड्रायव्हर अ‍ॅप येथे लोकेशन पाठवते (header: x-device-key)
r.post('/ping', (req, res) => {
  const v = q.get('SELECT * FROM vehicles WHERE device_key = ?', req.headers['x-device-key'] || '');
  if (!v) return res.status(401).json({ message: 'अवैध डिव्हाइस' });
  const { lat, lng, speed } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ message: 'lat/lng आवश्यक' });
  const at = now();
  q.run('INSERT INTO vehicle_pings (vehicle_id, lat, lng, speed, at) VALUES (?,?,?,?,?)', v.id, lat, lng, speed, at);
  q.run("UPDATE vehicles SET last_lat=?, last_lng=?, last_speed=?, last_seen=?, status=CASE WHEN status='maintenance' THEN status WHEN ? > 2 THEN 'running' ELSE 'idle' END WHERE id=?",
    lat, lng, speed, at, speed || 0, v.id);
  checkPing(v, lat, lng, speed || 0);
  emit('vehicle', { id: v.id, lat, lng, speed });
  res.json({ ok: true });
});

r.use(requireAuth, requireRole('officer', 'admin'));

r.get('/', (req, res) => {
  const params = [];
  let where = '';
  if (req.user.role === 'officer' && req.user.ward_id) { where = 'WHERE v.ward_id = ?'; params.push(req.user.ward_id); }
  res.json(q.all(`SELECT v.id, v.reg_no, v.type, v.ward_id, v.driver_name, v.driver_mobile, v.status, v.last_lat, v.last_lng, v.last_speed, v.last_seen,
      w.name AS ward_name,
      (SELECT COALESCE(SUM(litres),0) FROM fuel_logs f WHERE f.vehicle_id = v.id AND f.logged_at >= date('now','-30 day')) AS fuel_30d,
      (SELECT COALESCE(SUM(amount),0) FROM fuel_logs f WHERE f.vehicle_id = v.id AND f.logged_at >= date('now','-30 day')) AS fuel_cost_30d,
      (SELECT COALESCE(SUM(tonnes),0) FROM waste_trips t WHERE t.vehicle_id = v.id AND t.at >= date('now')) AS tonnes_today,
      (SELECT rc.completed_at FROM vehicle_routes vr JOIN route_completions rc ON rc.route_id = vr.id AND rc.date = ? WHERE vr.vehicle_id = v.id AND vr.active = 1) AS route_completed_at,
      (SELECT COUNT(*) FROM vehicle_routes vr WHERE vr.vehicle_id = v.id AND vr.active = 1) AS has_route
    FROM vehicles v LEFT JOIN wards w ON w.id = v.ward_id ${where} ORDER BY v.type, v.reg_no`, today(), ...params));
});

r.post('/', requireRole('admin'), (req, res) => {
  const { reg_no, type, ward_id, driver_name, driver_mobile } = req.body || {};
  if (!reg_no || !type) return res.status(400).json({ message: 'वाहन क्रमांक व प्रकार आवश्यक' });
  const key = crypto.randomBytes(16).toString('hex');
  const info = q.run('INSERT INTO vehicles (reg_no, type, ward_id, driver_name, driver_mobile, device_key) VALUES (?,?,?,?,?,?)',
    reg_no.toUpperCase(), type, ward_id, driver_name, driver_mobile, key);
  res.status(201).json({ id: Number(info.lastInsertRowid), device_key: key });
});

// ---- मार्ग (Designated Routes) व अलर्ट ----
r.get('/alerts', (req, res) => {
  const params = [];
  let where = req.query.all === '1' ? '1=1' : 'a.resolved = 0';
  if (req.user.role === 'officer' && req.user.ward_id) { where += ' AND v.ward_id = ?'; params.push(req.user.ward_id); }
  res.json(q.all(`SELECT a.*, v.reg_no, v.type AS vehicle_type, v.driver_name, v.driver_mobile, w.name AS ward_name FROM vehicle_alerts a
    JOIN vehicles v ON v.id = a.vehicle_id LEFT JOIN wards w ON w.id = v.ward_id WHERE ${where} ORDER BY a.id DESC LIMIT 100`, ...params));
});

r.post('/alerts/:id/resolve', (req, res) => {
  q.run('UPDATE vehicle_alerts SET resolved = 1 WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

r.get('/:id/route', (req, res) => {
  const route = q.get('SELECT * FROM vehicle_routes WHERE vehicle_id = ? AND active = 1 ORDER BY id DESC LIMIT 1', req.params.id);
  if (!route) return res.json(null);
  const done = q.get('SELECT completed_at FROM route_completions WHERE route_id = ? AND date = ?', route.id, today());
  res.json({ ...route, path: JSON.parse(route.path), checkpoints: checkpointStatus(route), completed_at: done?.completed_at || null });
});

r.post('/:id/route', (req, res) => {
  const { name, path, tolerance_m, shift_start, shift_end, checkpoints } = req.body || {};
  const valid = (p) => Array.isArray(p) && p.every((c) => Array.isArray(c) && c.length === 2 && c.every(Number.isFinite));
  if (!name || !valid(path) || path.length < 2) return res.status(400).json({ message: 'मार्गाचे नाव व नकाशावर किमान २ बिंदू आवश्यक' });
  if (!q.get('SELECT id FROM vehicles WHERE id = ?', req.params.id)) return res.status(404).json({ message: 'वाहन सापडले नाही' });
  const hm = /^\d{2}:\d{2}$/;
  q.run('UPDATE vehicle_routes SET active = 0 WHERE vehicle_id = ?', req.params.id);
  const rid = Number(q.run('INSERT INTO vehicle_routes (vehicle_id, name, path, tolerance_m, shift_start, shift_end, created_at) VALUES (?,?,?,?,?,?,?)',
    req.params.id, name, JSON.stringify(path), Math.max(30, Number(tolerance_m) || 150),
    hm.test(shift_start) ? shift_start : '06:00', hm.test(shift_end) ? shift_end : '14:00', now()).lastInsertRowid);
  for (const [i, c] of (checkpoints || []).entries()) {
    if (Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
      q.run('INSERT INTO route_checkpoints (route_id, name, lat, lng, radius_m) VALUES (?,?,?,?,?)', rid, c.name || `थांबा ${i + 1}`, c.lat, c.lng, c.radius_m || 60);
    }
  }
  res.status(201).json({ id: rid });
});

r.get('/:id/track', (req, res) => {
  res.json(q.all("SELECT lat, lng, speed, at FROM vehicle_pings WHERE vehicle_id = ? AND at >= datetime('now','-12 hour') ORDER BY id", req.params.id));
});

r.get('/:id/fuel', (req, res) => {
  res.json(q.all(`SELECT f.*, u.name AS logged_by_name FROM fuel_logs f LEFT JOIN users u ON u.id = f.logged_by
    WHERE f.vehicle_id = ? ORDER BY f.logged_at DESC LIMIT 50`, req.params.id));
});

r.post('/:id/fuel', (req, res) => {
  const { litres, amount, odometer_km } = req.body || {};
  if (!(litres > 0) || !(amount > 0)) return res.status(400).json({ message: 'लिटर व रक्कम योग्य भरा' });
  q.run('INSERT INTO fuel_logs (vehicle_id, litres, amount, odometer_km, logged_by, logged_at) VALUES (?,?,?,?,?,?)',
    req.params.id, litres, amount, odometer_km, req.user.id, now());
  res.status(201).json({ ok: true });
});

r.post('/:id/trip', (req, res) => {
  const v = q.get('SELECT * FROM vehicles WHERE id = ?', req.params.id);
  if (!v || !(req.body?.tonnes > 0)) return res.status(400).json({ message: 'टन योग्य भरा' });
  q.run('INSERT INTO waste_trips (vehicle_id, ward_id, tonnes, at) VALUES (?,?,?,?)', v.id, v.ward_id, req.body.tonnes, now());
  res.status(201).json({ ok: true });
});

export default r;
