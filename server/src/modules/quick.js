// WhatsApp लिंकवरून एका क्लिकवर मंजूर / नामंजूर — लॉगिनची गरज नाही, signed token पुरेसा.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { q } from '../db.js';
import { verifyAction } from '../utils/tokens.js';
import { APP_TYPES, decideApplication } from './approvals.js';
import { grievanceSummary, reviewGrievance } from './grievances.js';
import { ADVANCE_KINDS, LEAVE_TYPES, decideAdvance, decideLeave } from './hr.js';
import { decideMaterial } from './operations.js';

const r = Router();
r.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 60 }));

function resolve(req, res) {
  let t;
  try { t = verifyAction(req.params.token); } catch {
    res.status(403).json({ message: 'लिंक कालबाह्य किंवा अवैध आहे. कृपया App मध्ये लॉगिन करा.' });
    return null;
  }
  const user = q.get('SELECT id, name, role, designation, ward_id, department_id, active, signature_path FROM users WHERE id = ?', t.uid);
  if (!user?.active) { res.status(403).json({ message: 'खाते निष्क्रिय आहे' }); return null; }
  return { t, user };
}

r.get('/:token', (req, res) => {
  const ctx = resolve(req, res);
  if (!ctx) return;
  const { t, user } = ctx;
  if (t.kind === 'application') {
    const a = q.get('SELECT a.*, w.name AS ward_name FROM applications a LEFT JOIN wards w ON w.id = a.ward_id WHERE a.id = ?', t.id);
    if (!a) return res.status(404).json({ message: 'अर्ज सापडला नाही' });
    return res.json({
      kind: t.kind, officer: user.name, has_signature: !!user.signature_path,
      item: { title: APP_TYPES[a.type]?.name, number: a.app_no, name: a.applicant_name, ward: a.ward_name, details: JSON.parse(a.details || '{}'), status: a.status, created_at: a.created_at },
    });
  }
  if (t.kind === 'grievance_review') {
    const g = grievanceSummary(t.id, user);
    if (!g) return res.status(404).json({ message: 'तक्रार सापडली नाही' });
    return res.json({
      kind: t.kind, officer: user.name,
      item: { title: `${g.icon} ${g.category}`, number: g.ticket_no, name: g.assigned_name, ward: g.ward_name, address: g.address,
        status: g.status, before_photo: g.before_photo, after_photo: g.after_photo, created_at: g.created_at, resolved_at: g.resolved_at },
    });
  }
  if (t.kind === 'leave') {
    const l = q.get(`SELECT l.*, u.name, u.designation, w.name AS ward_name FROM leave_requests l JOIN users u ON u.id = l.user_id
      LEFT JOIN wards w ON w.id = u.ward_id WHERE l.id = ?`, t.id);
    if (!l) return res.status(404).json({ message: 'अर्ज सापडला नाही' });
    return res.json({
      kind: t.kind, officer: user.name,
      item: { title: `🏖️ ${LEAVE_TYPES[l.leave_type].name}`, number: `${l.from_date} ते ${l.to_date} (${l.days} दिवस)`, name: `${l.name} — ${l.designation || ''}`,
        ward: l.ward_name, details: l.reason ? { reason: l.reason } : {}, status: l.status, created_at: l.created_at },
    });
  }
  if (t.kind === 'advance') {
    const a = q.get(`SELECT r.*, u.name, u.designation, w.name AS ward_name FROM advance_requests r JOIN users u ON u.id = r.user_id
      LEFT JOIN wards w ON w.id = u.ward_id WHERE r.id = ?`, t.id);
    if (!a) return res.status(404).json({ message: 'अर्ज सापडला नाही' });
    return res.json({
      kind: t.kind, officer: user.name,
      item: { title: `💰 ${ADVANCE_KINDS[a.kind].name}`, number: `₹${a.amount.toLocaleString('en-IN')} · ${a.installments} हप्ते`, name: `${a.name} — ${a.designation || ''}`,
        ward: a.ward_name, details: a.reason ? { reason: a.reason } : {}, status: a.status, created_at: a.created_at },
    });
  }
  if (t.kind === 'material') {
    const m = q.get(`SELECT m.*, u.name, u.designation, w.name AS ward_name FROM material_requests m JOIN users u ON u.id = m.user_id
      LEFT JOIN wards w ON w.id = u.ward_id WHERE m.id = ?`, t.id);
    if (!m) return res.status(404).json({ message: 'मागणी सापडली नाही' });
    const items = JSON.parse(m.items);
    return res.json({
      kind: t.kind, officer: user.name,
      item: { title: '📦 साहित्य मागणी', number: m.request_no, name: `${m.name} — ${m.designation || ''}`, ward: m.ward_name,
        details: Object.fromEntries(items.map((i) => [i.name, `${i.qty} ${i.unit}`]).concat(m.reason ? [['reason', m.reason]] : [])), status: m.status, created_at: m.created_at },
    });
  }
  res.status(400).json({ message: 'अवैध लिंक' });
});

r.post('/:token', (req, res, next) => {
  const ctx = resolve(req, res);
  if (!ctx) return;
  const { t, user } = ctx;
  const { decision, remark, signature } = req.body || {};
  try {
    if (t.kind === 'application') {
      decideApplication(user, t.id, { decision: decision === 'approve' ? 'approved' : 'rejected', remark, signature });
    } else if (t.kind === 'grievance_review') {
      reviewGrievance(user, t.id, { action: decision === 'approve' ? 'close' : 'reopen', note: remark || (decision === 'approve' ? 'WhatsApp वरून मान्य' : 'WhatsApp वरून पुन्हा उघडले') });
    } else if (t.kind === 'leave') {
      decideLeave(user, t.id, { decision: decision === 'approve' ? 'approved' : 'rejected', remark });
    } else if (t.kind === 'advance') {
      decideAdvance(user, t.id, { decision: decision === 'approve' ? 'approved' : 'rejected', remark });
    } else if (t.kind === 'material') {
      decideMaterial(user, t.id, { decision: decision === 'approve' ? 'approved' : 'rejected', remark });
    } else return res.status(400).json({ message: 'अवैध लिंक' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
