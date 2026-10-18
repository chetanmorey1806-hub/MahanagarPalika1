// Geo-fenced selfie हजेरी
import { Router } from 'express';
import { q, now, today, audit } from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { distanceMeters, pointInPolygon } from '../utils/geo.js';
import { saveDataUrl } from '../utils/files.js';
import { emit } from '../live.js';

const r = Router();
r.use(requireAuth);

function checkFence(user, lat, lng) {
  const ward = user.ward_id ? q.get('SELECT * FROM wards WHERE id = ?', user.ward_id) : null;
  if (!ward) return { inside: true, distance: null, ward: null };
  const distance = distanceMeters(lat, lng, ward.lat, ward.lng);
  if (ward.boundary) {
    try { return { inside: pointInPolygon(lat, lng, JSON.parse(ward.boundary)[0]), distance, ward }; } catch { /* radius वापरा */ }
  }
  return { inside: distance <= ward.radius_m, distance, ward };
}

// चेहरा ओळख: पहिल्या हजेरीला चेहरा नोंदवला जातो, नंतर प्रत्येक हजेरीला तुलना.
// descriptor (128 अंक) मोबाईलवरच face-api ने काढला जातो — फोटो server वर तुलनेसाठी पाठवावा लागत नाही.
const FACE_THRESHOLD = Number(process.env.FACE_THRESHOLD || 0.55);
function checkFace(userId, descriptor) {
  if (!Array.isArray(descriptor) || descriptor.length !== 128 || !descriptor.every(Number.isFinite)) return { status: 'none' };
  const row = q.get('SELECT face_descriptor FROM users WHERE id = ?', userId);
  if (!row?.face_descriptor) {
    q.run('UPDATE users SET face_descriptor = ? WHERE id = ?', JSON.stringify(descriptor.map((x) => Math.round(x * 1e5) / 1e5)), userId);
    return { status: 'enrolled', verified: 1, distance: 0 };
  }
  const ref = JSON.parse(row.face_descriptor);
  const distance = Math.sqrt(ref.reduce((s, v, i) => s + (v - descriptor[i]) ** 2, 0));
  return { status: distance <= FACE_THRESHOLD ? 'match' : 'mismatch', verified: distance <= FACE_THRESHOLD ? 1 : 0, distance: Math.round(distance * 1000) / 1000 };
}

r.get('/today', (req, res) => {
  res.json(q.get('SELECT * FROM attendance WHERE user_id = ? AND date = ?', req.user.id, today()) || null);
});

r.post('/check-in', (req, res) => {
  const { lat, lng, photo, capturedAt, face_descriptor } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ message: 'GPS लोकेशन मिळाले नाही' });
  if (!photo) return res.status(400).json({ message: 'सेल्फी फोटो आवश्यक आहे' });
  // offline मध्ये घेतलेली हजेरी: फोटो घेतल्याची मूळ वेळ वापरा (भविष्यातील किंवा २४ तासांपेक्षा जुनी नाही)
  const at = capturedAt && Math.abs(Date.now() - Date.parse(capturedAt)) < 864e5 ? new Date(capturedAt).toISOString() : now();
  const date = new Date(at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const existing = q.get('SELECT * FROM attendance WHERE user_id = ? AND date = ?', req.user.id, date);
  if (existing?.check_in_at) return res.json(existing);

  const fence = checkFence(req.user, lat, lng);
  if (!fence.inside && config.geofenceMode === 'strict') {
    return res.status(403).json({ message: `तुम्ही ${fence.ward.name} क्षेत्राबाहेर आहात (${fence.distance} मी. दूर). नेमून दिलेल्या वॉर्डमधूनच हजेरी द्या.` });
  }
  const face = checkFace(req.user.id, face_descriptor);
  if (face.status === 'mismatch' && (process.env.FACE_MODE || 'warn') === 'strict') {
    return res.status(403).json({ message: 'चेहरा जुळला नाही — कृपया स्वतःचा स्पष्ट सेल्फी काढा' });
  }
  const photoPath = saveDataUrl(photo, 'attendance');
  q.run(`INSERT INTO attendance (user_id, date, check_in_at, check_in_lat, check_in_lng, check_in_photo, check_in_distance_m, inside_geofence, face_distance, face_verified)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, req.user.id, date, at, lat, lng, photoPath, fence.distance, fence.inside ? 1 : 0,
  face.distance ?? null, face.verified ?? null);
  q.run('INSERT INTO worker_locations (user_id, lat, lng, at) VALUES (?,?,?,?)', req.user.id, lat, lng, at);
  emit('attendance', { user_id: req.user.id, action: 'check_in' });
  audit(req.user.id, 'check_in', 'attendance', null, { lat, lng, inside: fence.inside });
  res.status(201).json({ ...q.get('SELECT * FROM attendance WHERE user_id = ? AND date = ?', req.user.id, date), face_status: face.status });
});

r.post('/check-out', (req, res) => {
  const { lat, lng, photo, capturedAt } = req.body || {};
  const at = capturedAt && Math.abs(Date.now() - Date.parse(capturedAt)) < 864e5 ? new Date(capturedAt).toISOString() : now();
  const date = new Date(at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const row = q.get('SELECT * FROM attendance WHERE user_id = ? AND date = ?', req.user.id, date);
  if (!row) return res.status(400).json({ message: 'आधी हजेरी (Check-in) द्या' });
  if (row.check_out_at) return res.json(row);
  const photoPath = photo ? saveDataUrl(photo, 'attendance') : null;
  q.run('UPDATE attendance SET check_out_at=?, check_out_lat=?, check_out_lng=?, check_out_photo=? WHERE id=?', at, lat, lng, photoPath, row.id);
  res.json(q.get('SELECT * FROM attendance WHERE id = ?', row.id));
});

// ड्युटीवर असताना दर काही मिनिटांनी लोकेशन (फक्त हजेरी दिल्यानंतर व निर्गमनापूर्वी)
r.post('/ping', (req, res) => {
  const { lat, lng, accuracy } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ message: 'lat/lng आवश्यक' });
  const a = q.get('SELECT check_in_at, check_out_at FROM attendance WHERE user_id = ? AND date = ?', req.user.id, today());
  if (!a?.check_in_at || a.check_out_at) return res.json({ ok: false, reason: 'off_duty' });
  const last = q.get('SELECT at FROM worker_locations WHERE user_id = ? ORDER BY id DESC LIMIT 1', req.user.id);
  if (last && Date.now() - Date.parse(last.at) < 110e3) return res.json({ ok: true, throttled: true });
  q.run('INSERT INTO worker_locations (user_id, lat, lng, accuracy, at) VALUES (?,?,?,?,?)', req.user.id, lat, lng, accuracy, now());
  emit('location', { user_id: req.user.id, lat, lng }, ['role:officer', 'role:admin']);
  res.json({ ok: true });
});

// अधिकाऱ्यांसाठी: ड्युटी रोस्टर — आज कोण हजर, कोण रजेवर, शेवटचे लोकेशन, प्रलंबित कामे
r.get('/roster', requireRole('officer', 'admin'), (req, res) => {
  const date = today();
  const where = ["u.role IN ('worker','clerk')", 'u.active = 1'];
  const params = [];
  if (req.user.role === 'officer') {
    where.push('u.department_id = ?'); params.push(req.user.department_id);
    if (req.user.ward_id) { where.push('u.ward_id = ?'); params.push(req.user.ward_id); }
  } else {
    if (req.query.ward_id) { where.push('u.ward_id = ?'); params.push(req.query.ward_id); }
    if (req.query.department_id) { where.push('u.department_id = ?'); params.push(req.query.department_id); }
  }
  const rows = q.all(`SELECT u.id, u.name, u.mobile, u.role, u.designation, w.name AS ward_name, d.name AS department_name,
      a.check_in_at, a.check_out_at, a.inside_geofence, a.face_verified,
      (SELECT leave_type FROM leave_requests l WHERE l.user_id = u.id AND l.status = 'approved' AND ? BETWEEN l.from_date AND l.to_date) AS leave_type,
      (SELECT COUNT(*) FROM grievances g WHERE g.assigned_to = u.id AND g.status IN ('new','assigned','in_progress')) AS open_tasks,
      (SELECT COUNT(*) FROM grievances g WHERE g.assigned_to = u.id AND g.status IN ('resolved','closed') AND g.resolved_at >= ?) AS done_today,
      l.lat AS last_lat, l.lng AS last_lng, l.at AS last_at
    FROM users u
    LEFT JOIN wards w ON w.id = u.ward_id LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN attendance a ON a.user_id = u.id AND a.date = ?
    LEFT JOIN worker_locations l ON l.id = (SELECT id FROM worker_locations x WHERE x.user_id = u.id AND x.at >= ? ORDER BY x.id DESC LIMIT 1)
    WHERE ${where.join(' AND ')} ORDER BY a.check_in_at IS NULL, u.name LIMIT 500`,
  date, new Date(`${date}T00:00:00+05:30`).toISOString(), date, new Date(`${date}T00:00:00+05:30`).toISOString(), ...params);
  res.json(rows.map((x) => ({ ...x, state: x.check_in_at ? (x.check_out_at ? 'off' : 'on_duty') : x.leave_type ? 'leave' : 'absent' })));
});

r.get('/my', (req, res) => {
  res.json(q.all('SELECT * FROM attendance WHERE user_id = ? ORDER BY date DESC LIMIT 31', req.user.id));
});

// अधिकाऱ्यांसाठी: आजची हजेरी (त्यांच्या विभाग/प्रभागाची)
r.get('/report', requireRole('officer', 'admin'), (req, res) => {
  const date = req.query.date || today();
  const where = ["u.role IN ('worker','clerk')", 'u.active = 1'];
  const params = [date, date];
  if (req.user.role === 'officer') {
    where.push('u.department_id = ?'); params.push(req.user.department_id);
    if (req.user.ward_id) { where.push('u.ward_id = ?'); params.push(req.user.ward_id); }
  }
  res.json(q.all(`SELECT u.id AS user_id, u.name, u.mobile, u.designation, w.name AS ward_name, d.name AS department_name,
      a.check_in_at, a.check_out_at, a.check_in_photo, a.inside_geofence, a.check_in_distance_m, a.face_verified,
      (SELECT leave_type FROM leave_requests l WHERE l.user_id = u.id AND l.status = 'approved' AND ? BETWEEN l.from_date AND l.to_date) AS leave_type
    FROM users u
    LEFT JOIN attendance a ON a.user_id = u.id AND a.date = ?
    LEFT JOIN wards w ON w.id = u.ward_id LEFT JOIN departments d ON d.id = u.department_id
    WHERE ${where.join(' AND ')} ORDER BY a.check_in_at IS NULL, u.name`, ...params));
});

export default r;
