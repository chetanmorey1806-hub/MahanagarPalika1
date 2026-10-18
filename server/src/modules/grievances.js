// तक्रार व्यवस्थापन: Auto-routing (GPS → वॉर्ड → विभाग → कर्मचारी), SLA, Before/After फोटो पुरावा
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { q, tx, now, today, audit, nextNumber } from '../db.js';
import { requireAuth, requireRole, scopeFilter } from '../middleware/auth.js';
import { encrypt, decrypt, maskMobile } from '../utils/crypto.js';
import { findWard } from '../utils/geo.js';
import { saveDataUrl } from '../utils/files.js';
import { notify } from '../utils/notify.js';
import { config } from '../config.js';
import { emit } from '../live.js';

// कर्मचाऱ्याच्या WhatsApp मेसेजमध्ये फोटो व नकाशा लिंक
const taskExtras = (lat, lng, photo) => [
  lat ? `\n📍 नकाशा: https://www.google.com/maps?q=${lat},${lng}` : '',
  photo ? `\n📸 फोटो: ${config.appUrl}${photo}` : '',
].join('');
export const liveGrievance = (g, action) => emit('grievance', { id: g.id, ticket_no: g.ticket_no, ward_id: g.ward_id, action });

const r = Router();
const OPEN = "('new','assigned','in_progress')";

const log = (gid, uid, action, note) =>
  q.run('INSERT INTO grievance_logs (grievance_id, user_id, action, note, created_at) VALUES (?,?,?,?,?)', gid, uid, action, note, now());

// योग्य अधिकारी: त्याच वॉर्ड+विभागाचा → विभागाचा (सर्व वॉर्ड) → आयुक्त/Admin
function findOfficer(wardId, deptId) {
  return q.get("SELECT id FROM users WHERE role='officer' AND active=1 AND department_id=? AND ward_id=? LIMIT 1", deptId, wardId)
    || q.get("SELECT id FROM users WHERE role='officer' AND active=1 AND department_id=? AND ward_id IS NULL LIMIT 1", deptId)
    || q.get("SELECT id FROM users WHERE role='admin' AND active=1 LIMIT 1");
}

// योग्य कर्मचारी: त्याच वॉर्ड+विभागाचा, आज हजर असलेल्याला प्राधान्य, आणि सर्वात कमी प्रलंबित कामे असलेला
function findWorker(wardId, deptId) {
  return q.get(`SELECT u.id,
      (SELECT COUNT(*) FROM grievances g WHERE g.assigned_to = u.id AND g.status IN ${OPEN}) AS load,
      EXISTS (SELECT 1 FROM attendance a WHERE a.user_id = u.id AND a.date = ? AND a.check_out_at IS NULL AND a.check_in_at IS NOT NULL) AS present
    FROM users u WHERE u.role='worker' AND u.active=1 AND u.department_id=? AND u.ward_id=?
    ORDER BY present DESC, load ASC, u.id LIMIT 1`, today(), deptId, wardId);
}

export function createGrievance({ category_id, description, citizen_name, citizen_mobile, lat, lng, address, ward_id, photo, source = 'citizen' }, actorId = null) {
  const cat = q.get('SELECT * FROM categories WHERE id = ?', category_id);
  if (!cat) throw Object.assign(new Error('तक्रारीचा प्रकार निवडा'), { status: 400 });
  if (citizen_mobile && !/^\d{10}$/.test(citizen_mobile)) throw Object.assign(new Error('मोबाईल नंबर १० अंकी हवा'), { status: 400 });

  let wardId = ward_id || null;
  if (!wardId && typeof lat === 'number' && typeof lng === 'number') {
    wardId = findWard(q.all('SELECT * FROM wards'), lat, lng)?.ward.id || null;
  }
  if (!wardId) throw Object.assign(new Error('लोकेशन किंवा वॉर्ड आवश्यक आहे'), { status: 400 });

  const photoPath = photo ? saveDataUrl(photo, 'grievances') : null;
  const createdAt = now();
  const slaDue = new Date(Date.now() + cat.sla_hours * 3600e3).toISOString();

  return tx(() => {
    const ticket = nextNumber('GRV', 'grievances', 'ticket_no');
    const officer = findOfficer(wardId, cat.department_id);
    const worker = findWorker(wardId, cat.department_id);
    const info = q.run(`INSERT INTO grievances (ticket_no, category_id, department_id, ward_id, description, citizen_name, citizen_mobile_enc,
        lat, lng, address, source, status, officer_id, assigned_to, complaint_photo, sla_due_at, created_at, priority)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ticket, cat.id, cat.department_id, wardId, description, citizen_name, encrypt(citizen_mobile),
      lat, lng, address, source, worker ? 'assigned' : 'new', officer?.id, worker?.id, photoPath, slaDue, createdAt, cat.priority || 'normal');
    const id = Number(info.lastInsertRowid);
    log(id, actorId, 'created', `${source} द्वारे नोंद`);
    if (worker) {
      log(id, null, 'auto_assigned', 'सिस्टीमने आपोआप कर्मचाऱ्याला दिले');
      notify(worker.id, `${cat.priority === 'high' ? '🔴 तातडीचे ' : ''}नवीन काम: ${cat.name}`,
        `तिकीट ${ticket} — ${address || ''} (${cat.sla_hours} तासांत पूर्ण करा)${taskExtras(lat, lng, photoPath)}`, `/tasks/${id}`);
    }
    liveGrievance({ id, ticket_no: ticket, ward_id: wardId }, 'created');
    if (officer) notify(officer.id, `नवीन तक्रार: ${cat.name}`, `तिकीट ${ticket}${worker ? '' : ' — कर्मचारी उपलब्ध नाही, कृपया नेमणूक करा'}`, `/grievances/${id}`);
    return { id, ticket_no: ticket, sla_due_at: slaDue };
  });
}

// ---------- सार्वजनिक (नागरिक) ----------
const publicLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, message: { message: 'खूप तक्रारी झाल्या, थोड्या वेळाने प्रयत्न करा' } });

r.post('/public', publicLimiter, (req, res, next) => {
  try {
    const { citizen_name, citizen_mobile } = req.body || {};
    if (!citizen_name || !citizen_mobile) return res.status(400).json({ message: 'नाव व मोबाईल नंबर आवश्यक आहे' });
    res.status(201).json(createGrievance({ ...req.body, source: 'citizen' }));
  } catch (e) { next(e); }
});

r.get('/public/track/:ticket', (req, res) => {
  const g = q.get(`SELECT g.ticket_no, g.status, g.created_at, g.resolved_at, g.sla_due_at, c.name AS category, w.name AS ward, g.after_photo, g.citizen_rating
    FROM grievances g JOIN categories c ON c.id = g.category_id LEFT JOIN wards w ON w.id = g.ward_id WHERE g.ticket_no = ?`, req.params.ticket);
  if (!g) return res.status(404).json({ message: 'तिकीट सापडले नाही' });
  res.json(g);
});

// नागरिक अभिप्राय: काम पूर्ण झाल्यावर १-५ स्टार (तिकीट + नोंदवलेला मोबाईल नंबर आवश्यक)
r.post('/public/rate/:ticket', publicLimiter, (req, res) => {
  const { rating, feedback, mobile } = req.body || {};
  const g = q.get('SELECT id, status, citizen_mobile_enc, citizen_rating FROM grievances WHERE ticket_no = ?', req.params.ticket);
  if (!g) return res.status(404).json({ message: 'तिकीट सापडले नाही' });
  if (!['resolved', 'closed'].includes(g.status)) return res.status(400).json({ message: 'काम पूर्ण झाल्यावरच रेटिंग देता येते' });
  if (g.citizen_mobile_enc && decrypt(g.citizen_mobile_enc) !== String(mobile || '')) return res.status(403).json({ message: 'तक्रार नोंदवलेला मोबाईल नंबर टाका' });
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ message: '१ ते ५ स्टार निवडा' });
  q.run('UPDATE grievances SET citizen_rating = ?, citizen_feedback = ? WHERE id = ?', Math.round(rating), feedback, g.id);
  log(g.id, null, 'rated', `नागरिक रेटिंग: ${'★'.repeat(Math.round(rating))}`);
  res.json({ ok: true });
});

// ---------- कर्मचारी / अधिकारी ----------
r.use(requireAuth);

r.post('/', (req, res, next) => {
  try { res.status(201).json(createGrievance({ ...req.body, source: req.body.source || 'staff' }, req.user.id)); }
  catch (e) { next(e); }
});

const LIST_SELECT = `SELECT g.id, g.ticket_no, g.status, g.priority, g.assigned_to, g.description, g.address, g.lat, g.lng, g.sla_due_at, g.escalation_level,
    g.before_photo, g.after_photo,
    g.created_at, g.resolved_at, g.source, c.name AS category, c.icon, w.name AS ward_name, d.name AS department_name,
    a.name AS assigned_name, o.name AS officer_name,
    CASE WHEN g.status IN ${OPEN} AND g.sla_due_at < strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 1 ELSE 0 END AS overdue
  FROM grievances g
  JOIN categories c ON c.id = g.category_id
  LEFT JOIN wards w ON w.id = g.ward_id
  LEFT JOIN departments d ON d.id = g.department_id
  LEFT JOIN users a ON a.id = g.assigned_to
  LEFT JOIN users o ON o.id = g.officer_id`;

// कर्मचाऱ्याची कामे
r.get('/my-tasks', (req, res) => {
  const done = req.query.done === '1';
  res.json(q.all(`${LIST_SELECT} WHERE g.assigned_to = ? AND g.status ${done ? 'IN (\'resolved\',\'closed\')' : `IN ${OPEN}`}
    ORDER BY g.sla_due_at ASC LIMIT 100`, req.user.id));
});

r.get('/', requireRole('clerk', 'officer', 'admin'), (req, res) => {
  const scope = scopeFilter(req.user, 'g');
  let sql = `${LIST_SELECT} WHERE 1=1${scope.sql}`;
  const params = [...scope.params];
  const { status, ward_id, department_id, overdue, search } = req.query;
  if (status === 'open') sql += ` AND g.status IN ${OPEN}`;
  else if (status) { sql += ' AND g.status = ?'; params.push(status); }
  if (ward_id) { sql += ' AND g.ward_id = ?'; params.push(ward_id); }
  if (department_id) { sql += ' AND g.department_id = ?'; params.push(department_id); }
  if (overdue === '1') sql += ` AND g.status IN ${OPEN} AND g.sla_due_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')`;
  if (search) { sql += ' AND (g.ticket_no LIKE ? OR g.address LIKE ? OR g.description LIKE ?)'; params.push(...Array(3).fill(`%${search}%`)); }
  sql += ' ORDER BY overdue DESC, g.created_at DESC LIMIT 500';
  res.json(q.all(sql, ...params));
});

function loadForUser(id, user) {
  const g = q.get(`${LIST_SELECT.replace('SELECT g.id,', 'SELECT g.*, g.id,')} WHERE g.id = ?`, id);
  if (!g) return null;
  const allowed = user.role === 'admin'
    || g.assigned_to === user.id
    || (['officer', 'clerk'].includes(user.role) && g.department_id === user.department_id && (!user.ward_id || g.ward_id === user.ward_id));
  return allowed ? g : false;
}

r.get('/:id', (req, res) => {
  const g = loadForUser(req.params.id, req.user);
  if (g === null) return res.status(404).json({ message: 'तक्रार सापडली नाही' });
  if (g === false) return res.status(403).json({ message: 'या तक्रारीसाठी परवानगी नाही' });
  const mobile = decrypt(g.citizen_mobile_enc);
  delete g.citizen_mobile_enc;
  g.citizen_mobile = req.user.role === 'worker' ? maskMobile(mobile) : mobile;
  g.logs = q.all(`SELECT l.*, u.name AS user_name FROM grievance_logs l LEFT JOIN users u ON u.id = l.user_id
    WHERE l.grievance_id = ? ORDER BY l.id`, g.id);
  res.json(g);
});

r.post('/:id/assign', requireRole('officer', 'admin'), (req, res) => {
  const g = loadForUser(req.params.id, req.user);
  if (!g) return res.status(g === null ? 404 : 403).json({ message: 'तक्रार सापडली नाही' });
  const worker = q.get("SELECT id, name FROM users WHERE id = ? AND role = 'worker' AND active = 1", req.body.worker_id);
  if (!worker) return res.status(400).json({ message: 'कर्मचारी निवडा' });
  q.run("UPDATE grievances SET assigned_to = ?, status = CASE WHEN status = 'new' THEN 'assigned' ELSE status END WHERE id = ?", worker.id, g.id);
  log(g.id, req.user.id, 'assigned', `${worker.name} यांना दिले`);
  notify(worker.id, `नवीन काम: ${g.category}`, `तिकीट ${g.ticket_no} — ${g.address || ''}${taskExtras(g.lat, g.lng, g.complaint_photo)}`, `/tasks/${g.id}`);
  liveGrievance(g, 'assigned');
  res.json({ ok: true });
});

// काम सुरू — Before फोटो
r.post('/:id/start', (req, res, next) => {
  try {
    const g = loadForUser(req.params.id, req.user);
    if (!g || g.assigned_to !== req.user.id) return res.status(403).json({ message: 'हे काम तुम्हाला दिलेले नाही' });
    if (g.status === 'in_progress' && g.before_photo) return res.json({ ok: true });
    const { photo, meta } = req.body || {};
    if (!photo) return res.status(400).json({ message: 'काम सुरू करण्यापूर्वीचा फोटो आवश्यक आहे' });
    q.run("UPDATE grievances SET status = 'in_progress', before_photo = ?, before_meta = ? WHERE id = ?",
      saveDataUrl(photo, 'work'), JSON.stringify(meta || {}), g.id);
    log(g.id, req.user.id, 'started', 'काम सुरू (Before फोटो)');
    liveGrievance(g, 'started');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// काम पूर्ण — After फोटो
r.post('/:id/resolve', (req, res, next) => {
  try {
    const g = loadForUser(req.params.id, req.user);
    if (!g || g.assigned_to !== req.user.id) return res.status(403).json({ message: 'हे काम तुम्हाला दिलेले नाही' });
    if (['resolved', 'closed'].includes(g.status)) return res.json({ ok: true });
    if (!g.before_photo) return res.status(400).json({ message: 'आधी काम सुरू करण्याचा (Before) फोटो द्या' });
    const { photo, meta, note } = req.body || {};
    if (!photo) return res.status(400).json({ message: 'काम पूर्ण झाल्याचा फोटो आवश्यक आहे' });
    q.run("UPDATE grievances SET status = 'resolved', after_photo = ?, after_meta = ?, resolved_at = ? WHERE id = ?",
      saveDataUrl(photo, 'work'), JSON.stringify(meta || {}), meta?.capturedAt || now(), g.id);
    log(g.id, req.user.id, 'resolved', note || 'काम पूर्ण (After फोटो)');
    liveGrievance(g, 'resolved');
    notify(g.officer_id, `काम पूर्ण: ${g.ticket_no}`, `${g.category} — ${req.user.name} यांनी काम पूर्ण केले. कृपया Before/After फोटो तपासून बंद करा.`,
      `/grievances/${g.id}`, { quick: { kind: 'grievance_review', id: g.id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// अधिकारी: तपासणी करून बंद / पुन्हा उघडा / नाकारा (App व WhatsApp लिंक दोन्हीकडून)
export function reviewGrievance(user, id, { action, note }) {
  const g = loadForUser(id, user);
  if (!g) throw Object.assign(new Error('तक्रार सापडली नाही'), { status: g === null ? 404 : 403 });
  const map = { close: 'closed', reopen: 'assigned', reject: 'rejected' };
  if (!map[action]) throw Object.assign(new Error('चुकीची क्रिया'), { status: 400 });
  if (['closed', 'rejected'].includes(g.status)) throw Object.assign(new Error('ही तक्रार आधीच बंद आहे'), { status: 400 });
  if (action === 'reopen') {
    q.run("UPDATE grievances SET status='assigned', after_photo=NULL, resolved_at=NULL, reopen_count = reopen_count + 1 WHERE id=?", g.id);
    notify(g.assigned_to, `काम पुन्हा उघडले: ${g.ticket_no}`, note || 'काम समाधानकारक नाही, पुन्हा करा', `/tasks/${g.id}`);
  } else {
    q.run('UPDATE grievances SET status=?, resolved_at=COALESCE(resolved_at, ?) WHERE id=?', map[action], now(), g.id);
  }
  log(g.id, user.id, action, note);
  audit(user.id, `grievance_${action}`, 'grievance', g.id);
  liveGrievance(g, action);
  return g;
}

export function grievanceSummary(id, user) {
  return loadForUser(id, user);
}

// एकाच वेळी अनेक तक्रारी मान्य करून बंद करा (Kanban — "तपासणी बाकी")
r.post('/bulk-review', requireRole('officer', 'admin'), (req, res) => {
  const ids = (req.body?.ids || []).map(Number).filter(Boolean).slice(0, 100);
  const done = [];
  const failed = [];
  for (const id of ids) {
    try { reviewGrievance(req.user, id, { action: req.body.action === 'reopen' ? 'reopen' : 'close', note: req.body.note || 'एकत्रित मंजुरी' }); done.push(id); }
    catch (e) { failed.push({ id, message: e.message }); }
  }
  res.json({ done: done.length, failed });
});

// गैरहजर कर्मचाऱ्याची सर्व प्रलंबित कामे दुसऱ्या कर्मचाऱ्याकडे
r.post('/reassign', requireRole('officer', 'admin'), (req, res) => {
  const { from_worker, to_worker, ids } = req.body || {};
  const to = q.get("SELECT id, name, ward_id, department_id FROM users WHERE id = ? AND role = 'worker' AND active = 1", to_worker);
  if (!to) return res.status(400).json({ message: 'नवीन कर्मचारी निवडा' });
  const rows = ids?.length
    ? q.all(`SELECT * FROM grievances WHERE id IN (${ids.map(() => '?').join(',')}) AND status IN ${OPEN}`, ...ids)
    : q.all(`SELECT * FROM grievances WHERE assigned_to = ? AND status IN ${OPEN}`, from_worker);
  let moved = 0;
  for (const g of rows) {
    const allowed = req.user.role === 'admin' || (g.department_id === req.user.department_id && (!req.user.ward_id || g.ward_id === req.user.ward_id));
    if (!allowed) continue;
    q.run("UPDATE grievances SET assigned_to = ?, status = CASE WHEN status = 'new' THEN 'assigned' ELSE status END WHERE id = ?", to.id, g.id);
    log(g.id, req.user.id, 'assigned', `${to.name} यांच्याकडे हस्तांतरित`);
    moved++;
  }
  if (moved) {
    notify(to.id, `${moved} नवीन कामे तुमच्याकडे`, 'गैरहजर सहकाऱ्याची कामे तुम्हाला दिली आहेत', '/tasks');
    emit('grievance', { action: 'reassigned' });
  }
  res.json({ moved });
});

r.post('/:id/review', requireRole('officer', 'admin'), (req, res, next) => {
  try { reviewGrievance(req.user, req.params.id, req.body || {}); res.json({ ok: true }); } catch (e) { next(e); }
});

export default r;
