// मालमत्ता कर: मालमत्ता नोंद, वार्षिक कर आकारणी, सवलत/दंड, भरणा व पावती
//
// दर (₹ प्रति चौ. फूट प्रति वर्ष): निवासी २.५, व्यावसायिक ६, औद्योगिक ४, मिश्र ४
// सवलत: आर्थिक वर्षाच्या ३० जूनपूर्वी पूर्ण भरल्यास ५%
// दंड: ३० सप्टेंबरनंतर थकीत रकमेवर दरमहा २%
import { Router } from 'express';
import crypto from 'node:crypto';
import { q, tx, now, audit } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { encrypt, decrypt, maskMobile } from '../utils/crypto.js';
import { sendWhatsApp } from '../utils/notify.js';
import { config } from '../config.js';

const r = Router();
export const RATES = { RESIDENTIAL: 2.5, COMMERCIAL: 6, INDUSTRIAL: 4, MIXED: 4 };
// पाणीपट्टी — वार्षिक ठराविक रक्कम (₹)
export const WATER_RATES = { RESIDENTIAL: 1800, COMMERCIAL: 4200, INDUSTRIAL: 9000, MIXED: 3000 };
export const HEADS = { property: 'मालमत्ता कर', water: 'पाणीपट्टी' };
const TYPES = { RESIDENTIAL: 'निवासी', COMMERCIAL: 'व्यावसायिक', INDUSTRIAL: 'औद्योगिक', MIXED: 'मिश्र' };
const MODES = ['UPI', 'CREDIT_CARD', 'DEBIT_CARD', 'NET_BANKING', 'CASH', 'CHEQUE'];

export const currentFY = (d = new Date()) => {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${y + 1}`;
};
const round2 = (n) => Math.round(n * 100) / 100;

// दिलेल्या दिवशी देय रक्कम (सवलत / दंडासह)
export function computeDue(a, at = new Date()) {
  const startYear = Number(a.financial_year.slice(0, 4));
  const outstandingBase = a.tax_amount - a.amount_paid - a.discount_amount;
  let discount = a.discount_amount;
  let penalty = 0;
  if (a.amount_paid === 0 && at <= new Date(`${startYear}-06-30T23:59:59+05:30`)) discount = round2(a.tax_amount * 0.05);
  const penaltyFrom = new Date(`${startYear}-09-30T23:59:59+05:30`);
  if (at > penaltyFrom && outstandingBase > 0) {
    const months = Math.ceil((at - penaltyFrom) / (30 * 864e5));
    penalty = round2(outstandingBase * 0.02 * months);
  }
  const due = round2(Math.max(0, a.tax_amount - discount + Math.max(penalty, a.penalty_amount) - a.amount_paid));
  return { discount, penalty: Math.max(penalty, a.penalty_amount), due };
}

function withDue(a) {
  const d = computeDue(a);
  return { ...a, head_name: HEADS[a.tax_head], current_discount: d.discount, current_penalty: d.penalty, due_now: a.payment_status === 'PAID' ? 0 : d.due };
}

// ---- सार्वजनिक: मालमत्ता क्रमांकावरून थकबाकी पहा ----
r.get('/public/:propertyNo', (req, res) => {
  const p = q.get(`SELECT p.id, p.property_no, p.owner_name, p.address, p.property_type, p.built_up_area_sqft, w.name AS ward_name
    FROM properties p LEFT JOIN wards w ON w.id = p.ward_id WHERE p.property_no = ? AND p.is_deleted = 0`, req.params.propertyNo.toUpperCase());
  if (!p) return res.status(404).json({ message: 'मालमत्ता सापडली नाही' });
  const assessments = q.all("SELECT * FROM tax_assessments WHERE property_id = ? ORDER BY financial_year DESC, tax_head = 'water'", p.id).map(withDue);
  res.json({ ...p, type_name: TYPES[p.property_type], assessments, total_due: round2(assessments.reduce((s, a) => s + a.due_now, 0)) });
});

r.use(requireAuth, requireRole('clerk', 'officer', 'admin'));

const scope = (user) => (['officer', 'clerk'].includes(user.role) && user.ward_id ? { sql: ' AND p.ward_id = ?', params: [user.ward_id] } : { sql: '', params: [] });

r.get('/summary', (req, res) => {
  const fy = req.query.fy || currentFY();
  const s = scope(req.user);
  const byWard = q.all(`SELECT w.id, w.name, COUNT(DISTINCT p.id) AS properties,
      COALESCE(SUM(a.total_payable),0) AS demand, COALESCE(SUM(a.amount_paid),0) AS collected,
      SUM(a.payment_status = 'PAID') AS paid_count
    FROM wards w LEFT JOIN properties p ON p.ward_id = w.id AND p.is_deleted = 0
    LEFT JOIN tax_assessments a ON a.property_id = p.id AND a.financial_year = ?
    WHERE 1=1${s.sql} GROUP BY w.id ORDER BY w.id`, fy, ...s.params);
  const modes = q.all(`SELECT y.payment_mode, COUNT(*) AS n, SUM(y.amount_paid) AS amount FROM payments y
    JOIN tax_assessments a ON a.id = y.assessment_id JOIN properties p ON p.id = a.property_id
    WHERE a.financial_year = ? AND y.payment_status = 'SUCCESS'${s.sql} GROUP BY y.payment_mode ORDER BY amount DESC`, fy, ...s.params);
  const total = byWard.reduce((t, w) => ({ demand: t.demand + w.demand, collected: t.collected + w.collected, properties: t.properties + w.properties }), { demand: 0, collected: 0, properties: 0 });
  const byHead = q.all(`SELECT a.tax_head, SUM(a.total_payable) AS demand, SUM(a.amount_paid) AS collected FROM tax_assessments a
    JOIN properties p ON p.id = a.property_id WHERE a.financial_year = ?${s.sql} GROUP BY a.tax_head`, fy, ...s.params).map((h) => ({ ...h, head_name: HEADS[h.tax_head] }));
  res.json({ fy, total, byWard, byHead, modes, rates: RATES, water_rates: WATER_RATES });
});

r.get('/properties', (req, res) => {
  const s = scope(req.user);
  const params = [currentFY(), ...s.params];
  let sql = `SELECT p.id, p.property_no, p.owner_name, p.address, p.property_type, p.built_up_area_sqft, w.name AS ward_name,
      a.total_payable, a.amount_paid,
      CASE WHEN a.paid_heads = a.heads THEN 'PAID' WHEN a.amount_paid > 0 THEN 'PARTIAL' WHEN a.heads > 0 THEN 'PENDING' END AS payment_status
    FROM properties p LEFT JOIN wards w ON w.id = p.ward_id
    LEFT JOIN (SELECT property_id, SUM(total_payable) AS total_payable, SUM(amount_paid) AS amount_paid, COUNT(*) AS heads,
        SUM(payment_status = 'PAID') AS paid_heads FROM tax_assessments WHERE financial_year = ? GROUP BY property_id) a ON a.property_id = p.id
    WHERE p.is_deleted = 0${s.sql}`;
  if (req.query.search) { sql += ' AND (p.property_no LIKE ? OR p.owner_name LIKE ? OR p.address LIKE ?)'; params.push(...Array(3).fill(`%${req.query.search}%`)); }
  if (req.query.ward_id) { sql += ' AND p.ward_id = ?'; params.push(req.query.ward_id); }
  if (req.query.status === 'PAID') sql += ' AND a.paid_heads = a.heads';
  else if (req.query.status === 'PARTIAL') sql += ' AND a.paid_heads < a.heads AND a.amount_paid > 0';
  else if (req.query.status === 'PENDING') sql += ' AND a.amount_paid = 0';
  sql += ' ORDER BY p.property_no LIMIT 200';
  res.json(q.all(sql, ...params).map((p) => ({ ...p, type_name: TYPES[p.property_type] })));
});

r.post('/properties', (req, res) => {
  const { owner_name, owner_mobile, ward_id, address, built_up_area_sqft, property_type, lat, lng } = req.body || {};
  if (!owner_name || !ward_id || !(built_up_area_sqft > 0) || !RATES[property_type]) return res.status(400).json({ message: 'मालक, प्रभाग, क्षेत्रफळ व प्रकार आवश्यक' });
  const at = now();
  const id = tx(() => {
    const no = `PR-${String(ward_id).padStart(2, '0')}-${String(q.get('SELECT COUNT(*) AS c FROM properties').c + 1).padStart(5, '0')}`;
    const pid = Number(q.run(`INSERT INTO properties (property_no, owner_name, owner_mobile_enc, ward_id, address, built_up_area_sqft, property_type, lat, lng, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, no, owner_name, encrypt(owner_mobile), ward_id, address, built_up_area_sqft, property_type, lat, lng, at, at).lastInsertRowid);
    const tax = round2(built_up_area_sqft * RATES[property_type]);
    q.run(`INSERT INTO tax_assessments (property_id, financial_year, tax_amount, total_payable, tax_head, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`, pid, currentFY(), tax, tax, 'property', at, at);
    const water = WATER_RATES[property_type];
    q.run(`INSERT INTO tax_assessments (property_id, financial_year, tax_amount, total_payable, tax_head, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`, pid, currentFY(), water, water, 'water', at, at);
    return pid;
  });
  audit(req.user.id, 'create_property', 'property', id);
  res.status(201).json({ id });
});

r.get('/properties/:id', (req, res) => {
  const p = q.get(`SELECT p.*, w.name AS ward_name FROM properties p LEFT JOIN wards w ON w.id = p.ward_id WHERE p.id = ? AND p.is_deleted = 0`, req.params.id);
  if (!p) return res.status(404).json({ message: 'मालमत्ता सापडली नाही' });
  if (['officer', 'clerk'].includes(req.user.role) && req.user.ward_id && p.ward_id !== req.user.ward_id) return res.status(403).json({ message: 'हा तुमचा प्रभाग नाही' });
  p.owner_mobile = maskMobile(decrypt(p.owner_mobile_enc));
  delete p.owner_mobile_enc;
  p.type_name = TYPES[p.property_type];
  p.rate = RATES[p.property_type];
  p.assessments = q.all('SELECT * FROM tax_assessments WHERE property_id = ? ORDER BY financial_year DESC', p.id).map(withDue);
  p.payments = q.all(`SELECT y.*, a.financial_year, u.name AS collected_by_name FROM payments y JOIN tax_assessments a ON a.id = y.assessment_id
    LEFT JOIN users u ON u.id = y.collected_by WHERE a.property_id = ? ORDER BY y.id DESC`, p.id);
  res.json(p);
});

// नवीन आर्थिक वर्षाची कर आकारणी सर्व मालमत्तांसाठी (Admin)
r.post('/assess', requireRole('admin'), (req, res) => {
  const fy = /^\d{4}-\d{4}$/.test(req.body?.financial_year || '') ? req.body.financial_year : currentFY();
  const at = now();
  let created = 0;
  tx(() => {
    for (const p of q.all('SELECT id, built_up_area_sqft, property_type FROM properties WHERE is_deleted = 0')) {
      const tax = round2(p.built_up_area_sqft * RATES[p.property_type]);
      created += Number(q.run(`INSERT OR IGNORE INTO tax_assessments (property_id, financial_year, tax_amount, total_payable, tax_head, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?)`, p.id, fy, tax, tax, 'property', at, at).changes);
      const water = WATER_RATES[p.property_type];
      q.run(`INSERT OR IGNORE INTO tax_assessments (property_id, financial_year, tax_amount, total_payable, tax_head, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?)`, p.id, fy, water, water, 'water', at, at);
    }
  });
  audit(req.user.id, 'tax_assess', 'tax_assessments', null, { fy, created });
  res.json({ ok: true, financial_year: fy, created });
});

// कर भरणा (काउंटरवर रोख/चेक/UPI). ऑनलाइन gateway साठी याच फंक्शनला webhook मधून बोलवा.
// ---- थकबाकीदार (Defaulters) ----
// मागील वर्षाचा कर बाकी, किंवा चालू वर्षाचा कर ३० सप्टेंबरनंतरही बाकी
export function defaulters({ wardId, minDue = 0, search } = {}) {
  const fy = currentFY();
  const penaltyStarted = new Date() > new Date(`${fy.slice(0, 4)}-09-30T23:59:59+05:30`);
  const params = [];
  let where = "a.payment_status <> 'PAID' AND p.is_deleted = 0";
  if (wardId) { where += ' AND p.ward_id = ?'; params.push(wardId); }
  if (search) { where += ' AND (p.property_no LIKE ? OR p.owner_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  const rows = q.all(`SELECT a.*, p.property_no, p.owner_name, p.owner_mobile_enc, p.address, p.property_type, p.ward_id, p.last_notice_at, w.name AS ward_name
    FROM tax_assessments a JOIN properties p ON p.id = a.property_id LEFT JOIN wards w ON w.id = p.ward_id WHERE ${where}`, ...params);
  const by = new Map();
  for (const a of rows) {
    const overdue = a.financial_year < fy || penaltyStarted;
    if (!overdue) continue;
    const d = computeDue(a);
    const x = by.get(a.property_id) || {
      property_id: a.property_id, property_no: a.property_no, owner_name: a.owner_name, address: a.address, ward_id: a.ward_id, ward_name: a.ward_name,
      property_type: a.property_type, type_name: TYPES[a.property_type], owner_mobile: maskMobile(decrypt(a.owner_mobile_enc)), last_notice_at: a.last_notice_at,
      total_due: 0, penalty: 0, years: new Set(), heads: new Set(),
    };
    x.total_due += d.due; x.penalty += d.penalty; x.years.add(a.financial_year); x.heads.add(HEADS[a.tax_head]);
    by.set(a.property_id, x);
  }
  const lastPay = Object.fromEntries(q.all(`SELECT a.property_id, MAX(y.paid_at) AS last FROM payments y JOIN tax_assessments a ON a.id = y.assessment_id GROUP BY a.property_id`).map((x) => [x.property_id, x.last]));
  return [...by.values()].map((x) => ({ ...x, total_due: round2(x.total_due), penalty: round2(x.penalty), years: [...x.years].sort(), heads: [...x.heads], last_paid_at: lastPay[x.property_id] || null }))
    .filter((x) => x.total_due >= minDue).sort((a, b) => b.total_due - a.total_due);
}

r.get('/defaulters', (req, res) => {
  const wardId = ['officer', 'clerk'].includes(req.user.role) && req.user.ward_id ? req.user.ward_id : req.query.ward_id || null;
  const list = defaulters({ wardId, minDue: Number(req.query.min_due) || 0, search: req.query.search });
  const byWard = {};
  for (const d of list) { byWard[d.ward_name] ||= { ward: d.ward_name, count: 0, due: 0 }; byWard[d.ward_name].count++; byWard[d.ward_name].due += d.total_due; }
  res.json({ fy: currentFY(), total_due: round2(list.reduce((s, d) => s + d.total_due, 0)), count: list.length, byWard: Object.values(byWard), list: list.slice(0, 500) });
});

// थकबाकी नोटीस — मालकाला WhatsApp / SMS
r.post('/defaulters/notice', (req, res) => {
  const ids = (req.body?.property_ids || []).map(Number).filter(Boolean).slice(0, 200);
  const all = new Map(defaulters({}).map((d) => [d.property_id, d]));
  let sent = 0;
  for (const id of ids) {
    const d = all.get(id);
    if (!d) continue;
    const p = q.get('SELECT owner_mobile_enc FROM properties WHERE id = ?', id);
    const mobile = decrypt(p?.owner_mobile_enc);
    if (mobile) {
      sendWhatsApp(mobile, `🏛️ *अमरावती महानगरपालिका — कर थकबाकी नोटीस*
मालमत्ता ${d.property_no} (${d.owner_name})
थकबाकी: ₹${Math.round(d.total_due).toLocaleString('en-IN')} (${d.years.join(', ')})
दंड टाळण्यासाठी त्वरित कर भरा. ${config.appUrl}/pay-tax`);
      sent++;
    }
    q.run('UPDATE properties SET last_notice_at = ? WHERE id = ?', now(), id);
  }
  audit(req.user.id, 'tax_notice', 'properties', null, { count: sent });
  res.json({ sent });
});

r.post('/assessments/:id/pay', (req, res) => {
  const { amount, payment_mode, reference } = req.body || {};
  if (!MODES.includes(payment_mode)) return res.status(400).json({ message: 'भरण्याची पद्धत निवडा' });
  const result = tx(() => {
    const a = q.get('SELECT a.*, p.ward_id FROM tax_assessments a JOIN properties p ON p.id = a.property_id WHERE a.id = ?', req.params.id);
    if (!a) throw Object.assign(new Error('कर आकारणी सापडली नाही'), { status: 404 });
    if (a.payment_status === 'PAID') throw Object.assign(new Error('हा कर आधीच पूर्ण भरलेला आहे'), { status: 400 });
    const d = computeDue(a);
    const pay = round2(Number(amount) || d.due);
    if (!(pay > 0) || pay > d.due + 0.01) throw Object.assign(new Error(`रक्कम ₹१ ते ₹${d.due} दरम्यान हवी`), { status: 400 });
    const paidTotal = round2(a.amount_paid + pay);
    const full = pay >= d.due - 0.01;
    // पूर्ण भरणा झाल्यास त्या दिवसाची सवलत/दंड कायम करा
    const discount = full ? d.discount : a.discount_amount;
    const penalty = d.penalty;
    const total = round2(a.tax_amount - discount + penalty);
    const txn = `MNP${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const pid = Number(q.run(`INSERT INTO payments (transaction_id, assessment_id, ward_id, amount_paid, payment_mode, payment_gateway_response, payment_status, collected_by, paid_at)
      VALUES (?,?,?,?,?,?,?,?,?)`, txn, a.id, a.ward_id, pay, payment_mode, JSON.stringify({ reference: reference || null, channel: 'counter' }), 'SUCCESS', req.user.id, now()).lastInsertRowid);
    q.run('UPDATE tax_assessments SET amount_paid=?, discount_amount=?, penalty_amount=?, total_payable=?, payment_status=?, updated_at=? WHERE id=?',
      paidTotal, discount, penalty, total, full ? 'PAID' : 'PARTIAL', now(), a.id);
    return { payment_id: pid, transaction_id: txn };
  });
  audit(req.user.id, 'tax_payment', 'payment', result.payment_id);
  res.status(201).json(result);
});

r.get('/payments/:id/receipt', (req, res) => {
  const y = q.get(`SELECT y.*, a.financial_year, a.tax_head, a.tax_amount, a.discount_amount, a.penalty_amount, a.total_payable, a.amount_paid AS total_paid, a.payment_status AS assessment_status,
      p.property_no, p.owner_name, p.address, p.property_type, p.built_up_area_sqft, w.name AS ward_name, u.name AS collected_by_name
    FROM payments y JOIN tax_assessments a ON a.id = y.assessment_id JOIN properties p ON p.id = a.property_id
    LEFT JOIN wards w ON w.id = p.ward_id LEFT JOIN users u ON u.id = y.collected_by WHERE y.id = ?`, req.params.id);
  if (!y) return res.status(404).json({ message: 'पावती सापडली नाही' });
  res.json({ ...y, type_name: TYPES[y.property_type], head_name: HEADS[y.tax_head] });
});

export default r;
