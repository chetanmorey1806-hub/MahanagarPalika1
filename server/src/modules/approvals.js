// दाखले व परवाने: जन्म/मृत्यू दाखला, बांधकाम परवाना, व्यापार परवाना, नळ जोडणी — डिजिटल स्वाक्षरीने मंजुरी
import { Router } from 'express';
import { q, now, audit, nextNumber } from '../db.js';
import { requireAuth, requireRole, scopeFilter } from '../middleware/auth.js';
import { encrypt, decrypt, sha256 } from '../utils/crypto.js';
import { saveDataUrl } from '../utils/files.js';
import { notify } from '../utils/notify.js';

const r = Router();

export const APP_TYPES = {
  birth: { name: 'जन्म दाखला', dept: 'health', prefix: 'BRT' },
  death: { name: 'मृत्यू दाखला', dept: 'health', prefix: 'DTH' },
  building: { name: 'बांधकाम परवाना', dept: 'planning', prefix: 'BLD' },
  trade: { name: 'व्यापार परवाना', dept: 'tax', prefix: 'TRD' },
  water: { name: 'नवीन नळ जोडणी', dept: 'water', prefix: 'WTR' },
};

const signPayload = (a) => JSON.stringify({ app_no: a.app_no, type: a.type, applicant: a.applicant_name, details: a.details, decided_by: a.decided_by, decided_at: a.decided_at });

// सार्वजनिक पडताळणी — दाखल्यावरील QR/क्रमांकावरून खरेपणा तपासा
r.get('/verify/:appNo', (req, res) => {
  const a = q.get(`SELECT a.*, u.name AS officer_name, u.designation FROM applications a LEFT JOIN users u ON u.id = a.decided_by
    WHERE a.app_no = ? AND a.status = 'approved'`, req.params.appNo);
  if (!a) return res.status(404).json({ valid: false, message: 'मंजूर दाखला सापडला नाही' });
  res.json({
    valid: sha256(signPayload(a)) === a.sign_hash,
    app_no: a.app_no, type: APP_TYPES[a.type]?.name, applicant_name: a.applicant_name,
    officer_name: a.officer_name, designation: a.designation, decided_at: a.decided_at,
  });
});

r.use(requireAuth);

r.get('/types', (req, res) => res.json(APP_TYPES));

r.post('/', requireRole('clerk', 'officer', 'admin'), (req, res) => {
  const { type, applicant_name, applicant_mobile, details, ward_id } = req.body || {};
  const t = APP_TYPES[type];
  if (!t || !applicant_name) return res.status(400).json({ message: 'अर्जाचा प्रकार व अर्जदाराचे नाव आवश्यक आहे' });
  const dept = q.get('SELECT id FROM departments WHERE code = ?', t.dept);
  const appNo = nextNumber(t.prefix, 'applications', 'app_no');
  const info = q.run(`INSERT INTO applications (app_no, type, applicant_name, applicant_mobile_enc, details, ward_id, department_id, created_at)
    VALUES (?,?,?,?,?,?,?,?)`, appNo, type, applicant_name, encrypt(applicant_mobile), JSON.stringify(details || {}),
    ward_id || req.user.ward_id, dept?.id, now());
  const approver = q.get("SELECT id FROM users WHERE role='officer' AND active=1 AND department_id=? ORDER BY ward_id IS NOT NULL, id LIMIT 1", dept?.id);
  const id = Number(info.lastInsertRowid);
  if (approver && approver.id !== req.user.id) {
    notify(approver.id, `मंजुरीसाठी अर्ज: ${t.name}`, `${appNo} — ${applicant_name}`, `/approvals/${id}`, { quick: { kind: 'application', id } });
  }
  res.status(201).json({ id, app_no: appNo });
});

r.get('/', requireRole('clerk', 'officer', 'admin'), (req, res) => {
  // अर्ज विभागनिहाय — वॉर्ड मर्यादा फक्त जर अधिकारी वॉर्ड-स्तरीय असेल तर
  const scope = scopeFilter(req.user, 'a');
  const params = [...scope.params];
  let sql = `SELECT a.id, a.app_no, a.type, a.applicant_name, a.details, a.status, a.created_at, a.decided_at, a.remark,
      w.name AS ward_name, u.name AS decided_by_name
    FROM applications a LEFT JOIN wards w ON w.id = a.ward_id LEFT JOIN users u ON u.id = a.decided_by
    WHERE 1=1${scope.sql}`;
  if (req.query.status) { sql += ' AND a.status = ?'; params.push(req.query.status); }
  sql += " ORDER BY a.status = 'pending' DESC, a.created_at DESC LIMIT 300";
  res.json(q.all(sql, ...params).map((a) => ({ ...a, type_name: APP_TYPES[a.type]?.name, details: JSON.parse(a.details || '{}') })));
});

export function canDecide(user, a) {
  return user.role === 'admin' || (user.department_id === a.department_id && (!user.ward_id || user.ward_id === a.ward_id));
}

r.get('/:id', (req, res) => {
  const a = q.get(`SELECT a.*, w.name AS ward_name, u.name AS officer_name, u.designation AS officer_designation
    FROM applications a LEFT JOIN wards w ON w.id = a.ward_id LEFT JOIN users u ON u.id = a.decided_by WHERE a.id = ?`, req.params.id);
  if (!a) return res.status(404).json({ message: 'अर्ज सापडला नाही' });
  if (req.user.role === 'worker' || !canDecide(req.user, a)) return res.status(403).json({ message: 'परवानगी नाही' });
  a.can_decide = req.user.role !== 'clerk';
  a.applicant_mobile = decrypt(a.applicant_mobile_enc);
  delete a.applicant_mobile_enc;
  a.type_name = APP_TYPES[a.type]?.name;
  a.details = JSON.parse(a.details || '{}');
  res.json(a);
});

// निर्णय — App, WhatsApp लिंक व WhatsApp bot तिघांकडून हेच वापरले जाते.
// signature: नवीन सही (dataURL); नसल्यास अधिकाऱ्याची आधी जतन केलेली सही वापरली जाते.
export function decideApplication(user, appId, { decision, remark, signature }) {
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  const a = q.get('SELECT * FROM applications WHERE id = ?', appId);
  if (!a) fail(404, 'अर्ज सापडला नाही');
  if (!canDecide(user, a)) fail(403, 'हा अर्ज तुमच्या विभागाचा नाही');
  if (a.status !== 'pending') fail(400, 'या अर्जावर आधीच निर्णय झाला आहे');
  if (!['approved', 'rejected'].includes(decision)) fail(400, 'मंजूर किंवा नामंजूर निवडा');
  if (decision === 'rejected' && !remark) fail(400, 'नामंजुरीचे कारण लिहा');

  let signaturePath = null;
  if (decision === 'approved') {
    if (signature) {
      signaturePath = saveDataUrl(signature, 'signatures');
      q.run('UPDATE users SET signature_path = ? WHERE id = ?', signaturePath, user.id); // पुढील एका-क्लिक मंजुरीसाठी
    } else {
      signaturePath = q.get('SELECT signature_path FROM users WHERE id = ?', user.id)?.signature_path;
      if (!signaturePath) fail(400, 'मंजुरीसाठी डिजिटल स्वाक्षरी आवश्यक आहे');
    }
  }
  const decidedAt = now();
  const signed = { ...a, decided_by: user.id, decided_at: decidedAt };
  q.run('UPDATE applications SET status=?, remark=?, decided_by=?, decided_at=?, signature_path=?, sign_hash=? WHERE id=?',
    decision, remark, user.id, decidedAt, signaturePath, decision === 'approved' ? sha256(signPayload(signed)) : null, a.id);
  audit(user.id, `application_${decision}`, 'application', a.id);
  return { ...a, status: decision, type_name: APP_TYPES[a.type]?.name };
}

r.get('/my-signature', (req, res) => {
  res.json({ signature_path: q.get('SELECT signature_path FROM users WHERE id = ?', req.user.id)?.signature_path || null });
});

// Bulk e-Sign: एकाच वेळी अनेक दाखले जतन केलेल्या सहीने मंजूर
r.post('/bulk-decide', requireRole('officer', 'admin'), (req, res) => {
  const ids = (req.body?.ids || []).map(Number).filter(Boolean).slice(0, 50);
  const { decision = 'approved', remark, signature } = req.body || {};
  const done = [];
  const failed = [];
  ids.forEach((id, i) => {
    // पहिल्या अर्जाला नवीन सही दिल्यास ती जतन होते; पुढचे अर्ज तीच सही वापरतात
    try { decideApplication(req.user, id, { decision, remark, signature: i === 0 ? signature : undefined }); done.push(id); }
    catch (e) { failed.push({ id, message: e.message }); }
  });
  res.json({ done: done.length, failed });
});

r.post('/:id/decide', requireRole('officer', 'admin'), (req, res, next) => {
  try { decideApplication(req.user, req.params.id, req.body || {}); res.json({ ok: true }); } catch (e) { next(e); }
});

export default r;
