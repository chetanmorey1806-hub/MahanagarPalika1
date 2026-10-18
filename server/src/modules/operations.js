// दैनंदिन कामकाज: कामाचे आदेश (Work Orders) व साहित्य मागणी (Material Requests)
import { Router } from 'express';
import { q, now, today, audit, nextNumber } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { approverFor, canSupervise } from '../utils/hierarchy.js';
import { saveDataUrl } from '../utils/files.js';
import { notify } from '../utils/notify.js';

const r = Router();
r.use(requireAuth);

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

// ================= कामाचे आदेश =================
// तक्रारींव्यतिरिक्तची कामे: स्वच्छता मोहीम, सर्वेक्षण, नालेसफाई, फाईल तयार करणे इ.
const WO_SELECT = `SELECT o.*, a.name AS assigned_name, a.designation AS assigned_designation, a.mobile AS assigned_mobile,
    b.name AS assigned_by_name, w.name AS ward_name,
    CASE WHEN o.status IN ('assigned','in_progress') AND o.due_date < ? THEN 1 ELSE 0 END AS overdue
  FROM work_orders o JOIN users a ON a.id = o.assigned_to JOIN users b ON b.id = o.assigned_by LEFT JOIN wards w ON w.id = o.ward_id`;

r.get('/work-orders/my', (req, res) => {
  const done = req.query.done === '1';
  res.json(q.all(`${WO_SELECT} WHERE o.assigned_to = ? AND o.status ${done ? "IN ('done','verified')" : "IN ('assigned','in_progress')"}
    ORDER BY o.due_date ASC, o.id DESC LIMIT 100`, today(), req.user.id));
});

r.get('/work-orders', requireRole('officer', 'admin'), (req, res) => {
  const params = [today()];
  let where = req.user.role === 'admin' ? '1=1' : 'o.assigned_by = ?';
  if (req.user.role !== 'admin') params.push(req.user.id);
  if (req.query.status) { where += ' AND o.status = ?'; params.push(req.query.status); }
  res.json(q.all(`${WO_SELECT} WHERE ${where} ORDER BY o.status = 'done' DESC, o.due_date ASC LIMIT 300`, ...params));
});

r.post('/work-orders', requireRole('officer', 'admin'), (req, res) => {
  const { title, description, location, assigned_to, due_date, needs_photo } = req.body || {};
  if (!title || !assigned_to || !/^\d{4}-\d{2}-\d{2}$/.test(due_date || '')) return res.status(400).json({ message: 'काम, कर्मचारी व अंतिम तारीख आवश्यक' });
  const staff = q.get("SELECT * FROM users WHERE id = ? AND active = 1 AND role IN ('worker','clerk')", assigned_to);
  if (!staff || !canSupervise(req.user, staff)) return res.status(403).json({ message: 'हा कर्मचारी तुमच्या अखत्यारीत नाही' });
  const no = nextNumber('WO', 'work_orders', 'order_no');
  const id = Number(q.run(`INSERT INTO work_orders (order_no, title, description, location, assigned_to, assigned_by, ward_id, department_id, due_date, needs_photo, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, no, title, description, location, staff.id, req.user.id, staff.ward_id, staff.department_id, due_date,
    needs_photo === false ? 0 : 1, now()).lastInsertRowid);
  notify(staff.id, `नवीन कामाचा आदेश: ${title}`, `${location ? `📍 ${location} · ` : ''}अंतिम तारीख ${due_date}`, `/work-orders/${id}`);
  res.status(201).json({ id, order_no: no });
});

function loadOrder(id, user) {
  const o = q.get(`${WO_SELECT} WHERE o.id = ?`, today(), id);
  if (!o) fail(404, 'आदेश सापडला नाही');
  if (o.assigned_to !== user.id && o.assigned_by !== user.id && user.role !== 'admin') fail(403, 'परवानगी नाही');
  return o;
}

r.get('/work-orders/:id', (req, res, next) => {
  try { res.json(loadOrder(req.params.id, req.user)); } catch (e) { next(e); }
});

r.post('/work-orders/:id/start', (req, res, next) => {
  try {
    const o = loadOrder(req.params.id, req.user);
    if (o.assigned_to !== req.user.id) fail(403, 'हे काम तुम्हाला दिलेले नाही');
    if (o.status !== 'assigned') return res.json({ ok: true });
    const { photo, meta } = req.body || {};
    if (o.needs_photo && !photo) fail(400, 'काम सुरू करण्यापूर्वीचा फोटो आवश्यक आहे');
    q.run("UPDATE work_orders SET status = 'in_progress', before_photo = ?, started_at = ?, lat = ?, lng = ? WHERE id = ?",
      photo ? saveDataUrl(photo, 'work') : null, meta?.capturedAt || now(), meta?.lat, meta?.lng, o.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.post('/work-orders/:id/complete', (req, res, next) => {
  try {
    const o = loadOrder(req.params.id, req.user);
    if (o.assigned_to !== req.user.id) fail(403, 'हे काम तुम्हाला दिलेले नाही');
    if (['done', 'verified'].includes(o.status)) return res.json({ ok: true });
    const { photo, meta, note } = req.body || {};
    if (o.needs_photo && !photo) fail(400, 'काम पूर्ण झाल्याचा फोटो आवश्यक आहे');
    q.run("UPDATE work_orders SET status = 'done', after_photo = ?, completion_note = ?, completed_at = ? WHERE id = ?",
      photo ? saveDataUrl(photo, 'work') : null, note, meta?.capturedAt || now(), o.id);
    notify(o.assigned_by, `काम पूर्ण: ${o.title}`, `${req.user.name} यांनी ${o.order_no} पूर्ण केले — कृपया तपासा`, `/work-orders/${o.id}`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.post('/work-orders/:id/verify', requireRole('officer', 'admin'), (req, res, next) => {
  try {
    const o = loadOrder(req.params.id, req.user);
    const { action, note } = req.body || {};
    if (o.status !== 'done' && action !== 'cancel') fail(400, 'काम अजून पूर्ण झालेले नाही');
    if (action === 'verify') q.run("UPDATE work_orders SET status = 'verified', verified_at = ? WHERE id = ?", now(), o.id);
    else if (action === 'redo') {
      q.run("UPDATE work_orders SET status = 'assigned', after_photo = NULL, completed_at = NULL WHERE id = ?", o.id);
      notify(o.assigned_to, `काम पुन्हा करा: ${o.title}`, note || 'काम समाधानकारक नाही', `/work-orders/${o.id}`);
    } else if (action === 'cancel') q.run("UPDATE work_orders SET status = 'cancelled' WHERE id = ?", o.id);
    else fail(400, 'चुकीची क्रिया');
    audit(req.user.id, `work_order_${action}`, 'work_order', o.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ================= साहित्य मागणी =================
// झाडू, हातमोजे, ब्लीचिंग पावडर, फावडे, गणवेश, स्टेशनरी इ.
export const COMMON_ITEMS = [
  ['झाडू', 'नग'], ['हातमोजे', 'जोडी'], ['मास्क', 'नग'], ['ब्लीचिंग पावडर', 'किलो'], ['फिनाईल', 'लिटर'], ['कचरा पिशव्या', 'नग'],
  ['फावडे', 'नग'], ['घमेले', 'नग'], ['गमबूट', 'जोडी'], ['रेनकोट', 'नग'], ['गणवेश', 'नग'], ['जंतुनाशक फवारणी औषध', 'लिटर'],
  ['A4 कागद', 'रिम'], ['पेन', 'नग'], ['फाईल कव्हर', 'नग'],
];

const MR_SELECT = `SELECT m.*, u.name, u.designation, u.role AS staff_role, u.ward_id AS staff_ward_id, u.department_id AS staff_department_id,
    w.name AS ward_name, a.name AS approver_name, x.name AS decided_by_name
  FROM material_requests m JOIN users u ON u.id = m.user_id LEFT JOIN wards w ON w.id = u.ward_id
  LEFT JOIN users a ON a.id = m.approver_id LEFT JOIN users x ON x.id = m.decided_by`;
const parseItems = (m) => ({ ...m, items: JSON.parse(m.items || '[]') });

r.get('/materials/items', (req, res) => res.json(COMMON_ITEMS.map(([name, unit]) => ({ name, unit }))));

r.get('/materials/my', (req, res) => {
  res.json(q.all(`${MR_SELECT} WHERE m.user_id = ? ORDER BY m.id DESC LIMIT 50`, req.user.id).map(parseItems));
});

r.post('/materials', (req, res) => {
  const { items, reason } = req.body || {};
  const clean = (Array.isArray(items) ? items : [])
    .map((i) => ({ name: String(i.name || '').trim().slice(0, 80), qty: Number(i.qty), unit: String(i.unit || 'नग').slice(0, 20) }))
    .filter((i) => i.name && i.qty > 0 && i.qty <= 10000);
  if (!clean.length) return res.status(400).json({ message: 'किमान एक वस्तू व संख्या निवडा' });
  const approver = approverFor(req.user);
  const no = nextNumber('MR', 'material_requests', 'request_no');
  const id = Number(q.run('INSERT INTO material_requests (request_no, user_id, items, reason, approver_id, created_at) VALUES (?,?,?,?,?,?)',
    no, req.user.id, JSON.stringify(clean), reason, approver, now()).lastInsertRowid);
  notify(approver, `साहित्य मागणी: ${req.user.name}`, clean.map((i) => `${i.name} ${i.qty} ${i.unit}`).join(', '), '/approvals-hr', { quick: { kind: 'material', id } });
  res.status(201).json({ id, request_no: no });
});

export function decideMaterial(user, id, { decision, remark }) {
  const m = q.get(MR_SELECT + ' WHERE m.id = ?', id);
  if (!m) fail(404, 'मागणी सापडली नाही');
  if (m.approver_id !== user.id && !canSupervise(user, { id: m.user_id, role: m.staff_role, ward_id: m.staff_ward_id, department_id: m.staff_department_id })) fail(403, 'ही मागणी मंजूर करण्याचा अधिकार नाही');
  if (decision === 'issued') {
    if (m.status !== 'approved') fail(400, 'आधी मंजूर करा');
    q.run("UPDATE material_requests SET status = 'issued', issued_at = ? WHERE id = ?", now(), m.id);
    notify(m.user_id, '📦 साहित्य मिळाले', `${m.request_no} — साहित्य वाटप झाले`, '/materials');
    return m;
  }
  if (m.status !== 'pending') fail(400, 'या मागणीवर आधीच निर्णय झाला आहे');
  if (!['approved', 'rejected'].includes(decision)) fail(400, 'मंजूर किंवा नामंजूर निवडा');
  if (decision === 'rejected' && !remark) fail(400, 'नामंजुरीचे कारण लिहा');
  q.run('UPDATE material_requests SET status = ?, remark = ?, decided_by = ?, decided_at = ? WHERE id = ?', decision, remark, user.id, now(), m.id);
  audit(user.id, `material_${decision}`, 'material_request', m.id);
  notify(m.user_id, decision === 'approved' ? '✅ साहित्य मागणी मंजूर' : '✖ साहित्य मागणी नामंजूर', `${m.request_no}${remark ? ` — ${remark}` : ''}`, '/materials');
  return m;
}

r.get('/materials/team', requireRole('officer', 'admin'), (req, res) => {
  const status = req.query.status || 'pending';
  res.json(q.all(`${MR_SELECT} WHERE m.status = ? ORDER BY m.id DESC LIMIT 200`, status).map(parseItems)
    .filter((m) => m.approver_id === req.user.id || canSupervise(req.user, { id: m.user_id, role: m.staff_role, ward_id: m.staff_ward_id, department_id: m.staff_department_id })));
});

r.post('/materials/:id/decide', requireRole('officer', 'admin'), (req, res, next) => {
  try { decideMaterial(req.user, Number(req.params.id), req.body || {}); res.json({ ok: true }); } catch (e) { next(e); }
});

export default r;
