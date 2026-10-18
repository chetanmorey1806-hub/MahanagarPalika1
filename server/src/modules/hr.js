// कर्मचारी सेवा (HR): रजा अर्ज व मंजुरी, पगार स्लिप, परिपत्रके, कर्मचारी संपर्क यादी
import { Router } from 'express';
import { q, now, today, audit, nextNumber } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { approverFor, canSupervise } from '../utils/hierarchy.js';
import { notify } from '../utils/notify.js';

const r = Router();
r.use(requireAuth);

export const LEAVE_TYPES = {
  casual: { name: 'किरकोळ रजा', perYear: 8 },
  sick: { name: 'आजारपणाची रजा', perYear: 10 },
  earned: { name: 'अर्जित रजा', perYear: 20 },
  other: { name: 'इतर (बिनपगारी)', perYear: null },
};

const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !Number.isNaN(Date.parse(d));
const eachDay = (from, to) => {
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
};
const isSunday = (d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 0;
const holidaySet = (from, to) => new Set(q.all('SELECT date FROM holidays WHERE date BETWEEN ? AND ?', from, to).map((h) => h.date));

// रविवार व सुट्ट्या वगळून रजेचे दिवस
function leaveDays(from, to) {
  const hol = holidaySet(from, to);
  return eachDay(from, to).filter((d) => !isSunday(d) && !hol.has(d)).length;
}

function balance(userId, year) {
  const used = Object.fromEntries(q.all(`SELECT leave_type, SUM(days) AS d FROM leave_requests
    WHERE user_id = ? AND status = 'approved' AND substr(from_date,1,4) = ? GROUP BY leave_type`, userId, String(year)).map((x) => [x.leave_type, x.d]));
  const pending = Object.fromEntries(q.all(`SELECT leave_type, SUM(days) AS d FROM leave_requests
    WHERE user_id = ? AND status = 'pending' AND substr(from_date,1,4) = ? GROUP BY leave_type`, userId, String(year)).map((x) => [x.leave_type, x.d]));
  return Object.entries(LEAVE_TYPES).map(([k, t]) => ({
    type: k, name: t.name, entitled: t.perYear, used: used[k] || 0, pending: pending[k] || 0,
    available: t.perYear == null ? null : Math.max(0, t.perYear - (used[k] || 0) - (pending[k] || 0)),
  }));
}

const LEAVE_SELECT = `SELECT l.*, u.name, u.designation, u.mobile, u.role AS staff_role, u.ward_id AS staff_ward_id, u.department_id AS staff_department_id, w.name AS ward_name, d.name AS department_name, a.name AS approver_name, x.name AS decided_by_name
  FROM leave_requests l JOIN users u ON u.id = l.user_id
  LEFT JOIN wards w ON w.id = u.ward_id LEFT JOIN departments d ON d.id = u.department_id
  LEFT JOIN users a ON a.id = l.approver_id LEFT JOIN users x ON x.id = l.decided_by`;

// ---------- रजा ----------
r.get('/leave/my', (req, res) => {
  const year = new Date().getFullYear();
  res.json({
    balance: balance(req.user.id, year),
    requests: q.all(`${LEAVE_SELECT} WHERE l.user_id = ? ORDER BY l.id DESC LIMIT 50`, req.user.id),
    types: LEAVE_TYPES,
  });
});

r.post('/leave', (req, res) => {
  const { leave_type, from_date, to_date, reason } = req.body || {};
  if (!LEAVE_TYPES[leave_type]) return res.status(400).json({ message: 'रजेचा प्रकार निवडा' });
  if (!isDate(from_date) || !isDate(to_date) || to_date < from_date) return res.status(400).json({ message: 'तारखा योग्य निवडा' });
  if (eachDay(from_date, to_date).length > 60) return res.status(400).json({ message: 'एका वेळी जास्तीत जास्त ६० दिवस' });
  const days = leaveDays(from_date, to_date);
  if (!days) return res.status(400).json({ message: 'निवडलेल्या दिवसांत फक्त रविवार / सुट्टी आहे' });
  const overlap = q.get(`SELECT id FROM leave_requests WHERE user_id = ? AND status IN ('pending','approved') AND from_date <= ? AND to_date >= ?`, req.user.id, to_date, from_date);
  if (overlap) return res.status(409).json({ message: 'या तारखांना आधीच रजा अर्ज आहे' });
  const bal = balance(req.user.id, from_date.slice(0, 4)).find((b) => b.type === leave_type);
  if (bal.available != null && days > bal.available) return res.status(400).json({ message: `${bal.name} फक्त ${bal.available} दिवस शिल्लक आहे` });

  const approver = approverFor(req.user);
  const id = Number(q.run(`INSERT INTO leave_requests (user_id, leave_type, from_date, to_date, days, reason, approver_id, created_at)
    VALUES (?,?,?,?,?,?,?,?)`, req.user.id, leave_type, from_date, to_date, days, reason, approver, now()).lastInsertRowid);
  notify(approver, `रजा अर्ज: ${req.user.name}`, `${LEAVE_TYPES[leave_type].name} — ${from_date} ते ${to_date} (${days} दिवस)${reason ? `\nकारण: ${reason}` : ''}`,
    '/approvals-hr', { quick: { kind: 'leave', id } });
  res.status(201).json({ id, days });
});

r.post('/leave/:id/cancel', (req, res) => {
  const l = q.get('SELECT * FROM leave_requests WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!l) return res.status(404).json({ message: 'अर्ज सापडला नाही' });
  if (l.status !== 'pending' && !(l.status === 'approved' && l.from_date > today())) return res.status(400).json({ message: 'हा अर्ज आता रद्द करता येत नाही' });
  q.run("UPDATE leave_requests SET status = 'cancelled' WHERE id = ?", l.id);
  res.json({ ok: true });
});

export function decideLeave(user, id, { decision, remark }) {
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  const l = q.get('SELECT l.*, u.role, u.ward_id, u.department_id, u.name FROM leave_requests l JOIN users u ON u.id = l.user_id WHERE l.id = ?', id);
  if (!l) fail(404, 'अर्ज सापडला नाही');
  if (l.approver_id !== user.id && !canSupervise(user, { id: l.user_id, role: l.role, ward_id: l.ward_id, department_id: l.department_id })) fail(403, 'हा अर्ज मंजूर करण्याचा अधिकार नाही');
  if (l.status !== 'pending') fail(400, 'या अर्जावर आधीच निर्णय झाला आहे');
  if (!['approved', 'rejected'].includes(decision)) fail(400, 'मंजूर किंवा नामंजूर निवडा');
  if (decision === 'rejected' && !remark) fail(400, 'नामंजुरीचे कारण लिहा');
  q.run('UPDATE leave_requests SET status = ?, remark = ?, decided_by = ?, decided_at = ? WHERE id = ?', decision, remark, user.id, now(), l.id);
  audit(user.id, `leave_${decision}`, 'leave', l.id);
  notify(l.user_id, decision === 'approved' ? '✅ रजा मंजूर' : '✖ रजा नामंजूर',
    `${LEAVE_TYPES[l.leave_type].name} ${l.from_date} ते ${l.to_date}${remark ? ` — ${remark}` : ''}`, '/leave');
  return l;
}

// अधिकाऱ्यांसाठी: माझ्याकडे मंजुरीसाठी आलेले रजा अर्ज + माझ्या कर्मचाऱ्यांच्या रजा
r.get('/leave/team', requireRole('officer', 'admin'), (req, res) => {
  const status = req.query.status || 'pending';
  const rows = q.all(`${LEAVE_SELECT} WHERE l.status = ? ORDER BY l.from_date ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 200`, status);
  res.json(rows.filter((l) => l.approver_id === req.user.id
    || canSupervise(req.user, { id: l.user_id, role: l.staff_role, ward_id: l.staff_ward_id, department_id: l.staff_department_id })));
});

r.post('/leave/:id/decide', requireRole('officer', 'admin'), (req, res, next) => {
  try { decideLeave(req.user, Number(req.params.id), req.body || {}); res.json({ ok: true }); } catch (e) { next(e); }
});

// आज रजेवर असलेले (हजेरी अहवालासाठी)
export function onLeave(date) {
  return new Map(q.all("SELECT user_id, leave_type FROM leave_requests WHERE status = 'approved' AND ? BETWEEN from_date AND to_date", date).map((l) => [l.user_id, l.leave_type]));
}

// ---------- अग्रीम / कर्ज अर्ज ----------
// मर्यादा: सण अग्रीम ₹१२,५०० (१० हप्ते), पगार अग्रीम = मूळ वेतनाच्या ५०% (१ हप्ता),
// वैद्यकीय ₹५०,००० (१२), शैक्षणिक ₹४०,००० (१०), घर कर्ज = मूळ वेतन × ३० (१२०), वाहन कर्ज = मूळ वेतन × ५ (६०)
export const ADVANCE_KINDS = {
  festival: { name: 'सण अग्रीम', max: () => 12500, maxInst: 10 },
  salary: { name: 'पगार अग्रीम', max: (b) => Math.round((b || 0) * 0.5), maxInst: 1 },
  medical: { name: 'वैद्यकीय अग्रीम', max: () => 50000, maxInst: 12 },
  education: { name: 'शैक्षणिक अग्रीम', max: () => 40000, maxInst: 10 },
  house_loan: { name: 'घर बांधणी कर्ज', max: (b) => Math.round((b || 0) * 30), maxInst: 120 },
  vehicle_loan: { name: 'वाहन कर्ज', max: (b) => Math.round((b || 0) * 5), maxInst: 60 },
};
const ADV_SELECT = `SELECT r.*, u.name, u.designation, u.mobile, u.basic_pay, u.role AS staff_role, u.ward_id AS staff_ward_id, u.department_id AS staff_department_id,
    w.name AS ward_name, a.name AS approver_name, x.name AS decided_by_name
  FROM advance_requests r JOIN users u ON u.id = r.user_id LEFT JOIN wards w ON w.id = u.ward_id
  LEFT JOIN users a ON a.id = r.approver_id LEFT JOIN users x ON x.id = r.decided_by`;
const advView = (r) => ({ ...r, kind_name: ADVANCE_KINDS[r.kind]?.name, installment: Math.round(r.amount / r.installments) });

r.get('/advance/my', (req, res) => {
  const basic = q.get('SELECT basic_pay FROM users WHERE id = ?', req.user.id)?.basic_pay;
  res.json({
    kinds: Object.fromEntries(Object.entries(ADVANCE_KINDS).map(([k, v]) => [k, { name: v.name, max: v.max(basic), maxInst: v.maxInst }])),
    requests: q.all(`${ADV_SELECT} WHERE r.user_id = ? ORDER BY r.id DESC LIMIT 50`, req.user.id).map(advView),
  });
});

r.post('/advance', (req, res) => {
  const { kind, amount, installments, reason } = req.body || {};
  const k = ADVANCE_KINDS[kind];
  if (!k) return res.status(400).json({ message: 'अग्रीमाचा प्रकार निवडा' });
  const basic = q.get('SELECT basic_pay FROM users WHERE id = ?', req.user.id)?.basic_pay;
  const max = k.max(basic);
  const amt = Math.round(Number(amount));
  const inst = Math.max(1, Math.min(k.maxInst, Math.round(Number(installments) || 1)));
  if (!(amt > 0) || amt > max) return res.status(400).json({ message: `रक्कम ₹१ ते ₹${max.toLocaleString('en-IN')} दरम्यान हवी` });
  if (q.get("SELECT id FROM advance_requests WHERE user_id = ? AND kind = ? AND status IN ('pending','approved')", req.user.id, kind)) {
    return res.status(409).json({ message: 'या प्रकारचा अर्ज आधीच प्रलंबित आहे' });
  }
  const approver = approverFor(req.user);
  const no = nextNumber('ADV', 'advance_requests', 'request_no');
  const id = Number(q.run('INSERT INTO advance_requests (request_no, user_id, kind, amount, installments, reason, approver_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
    no, req.user.id, kind, amt, inst, reason, approver, now()).lastInsertRowid);
  notify(approver, `अग्रीम अर्ज: ${req.user.name}`, `${k.name} — ₹${amt.toLocaleString('en-IN')} (${inst} हप्ते)${reason ? `\nकारण: ${reason}` : ''}`,
    '/approvals-hr?tab=advance', { quick: { kind: 'advance', id } });
  res.status(201).json({ id, request_no: no });
});

export function decideAdvance(user, id, { decision, remark }) {
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  const r0 = q.get(`${ADV_SELECT} WHERE r.id = ?`, id);
  if (!r0) fail(404, 'अर्ज सापडला नाही');
  if (r0.approver_id !== user.id && !canSupervise(user, { id: r0.user_id, role: r0.staff_role, ward_id: r0.staff_ward_id, department_id: r0.staff_department_id })) fail(403, 'हा अर्ज मंजूर करण्याचा अधिकार नाही');
  if (decision === 'disbursed') {
    if (r0.status !== 'approved') fail(400, 'आधी मंजूर करा');
    q.run("UPDATE advance_requests SET status = 'disbursed', disbursed_at = ? WHERE id = ?", now(), r0.id);
    notify(r0.user_id, '💰 अग्रीम रक्कम जमा', `${ADVANCE_KINDS[r0.kind].name} ₹${r0.amount.toLocaleString('en-IN')} — पुढील महिन्यापासून हप्ता कपात`, '/advance');
    return r0;
  }
  if (r0.status !== 'pending') fail(400, 'या अर्जावर आधीच निर्णय झाला आहे');
  if (!['approved', 'rejected'].includes(decision)) fail(400, 'मंजूर किंवा नामंजूर निवडा');
  if (decision === 'rejected' && !remark) fail(400, 'नामंजुरीचे कारण लिहा');
  q.run('UPDATE advance_requests SET status = ?, remark = ?, decided_by = ?, decided_at = ? WHERE id = ?', decision, remark, user.id, now(), r0.id);
  audit(user.id, `advance_${decision}`, 'advance', r0.id);
  notify(r0.user_id, decision === 'approved' ? '✅ अग्रीम मंजूर' : '✖ अग्रीम नामंजूर', `${ADVANCE_KINDS[r0.kind].name} ₹${r0.amount.toLocaleString('en-IN')}${remark ? ` — ${remark}` : ''}`, '/advance');
  return r0;
}

r.get('/advance/team', requireRole('officer', 'admin'), (req, res) => {
  const status = req.query.status || 'pending';
  res.json(q.all(`${ADV_SELECT} WHERE r.status = ? ORDER BY r.id DESC LIMIT 200`, status).map(advView)
    .filter((x) => x.approver_id === req.user.id || canSupervise(req.user, { id: x.user_id, role: x.staff_role, ward_id: x.staff_ward_id, department_id: x.staff_department_id })));
});

r.post('/advance/:id/decide', requireRole('officer', 'admin'), (req, res, next) => {
  try { decideAdvance(req.user, Number(req.params.id), req.body || {}); res.json({ ok: true }); } catch (e) { next(e); }
});

r.post('/advance/:id/cancel', (req, res) => {
  q.run("UPDATE advance_requests SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'pending'", req.params.id, req.user.id);
  res.json({ ok: true });
});

// या महिन्यात कापायचे अग्रीम हप्ते (वितरणानंतरच्या पुढील महिन्यापासून)
function advanceDeductions(userId, month) {
  const [y, m] = month.split('-').map(Number);
  return q.all("SELECT * FROM advance_requests WHERE user_id = ? AND status = 'disbursed'", userId).map((a) => {
    const d = new Date(a.disbursed_at);
    const k = (y - d.getFullYear()) * 12 + (m - (d.getMonth() + 1)) - 1;
    return k >= 0 && k < a.installments ? [`${ADVANCE_KINDS[a.kind].name} हप्ता (${k + 1}/${a.installments})`, Math.round(a.amount / a.installments)] : null;
  }).filter(Boolean);
}

// ---------- पगार स्लिप (हजेरी + रजेवरून अंदाजे) ----------
// मूळ वेतन (basic_pay) admin भरतात. महागाई भत्ता ४६%, घरभाडे भत्ता १०%, PF १२% (मूळ + DA), व्यवसाय कर ₹२००.
export function payslip(userId, month) {
  const u = q.get(`SELECT u.id, u.name, u.designation, u.employee_code, u.basic_pay, u.joining_date, w.name AS ward_name, d.name AS department_name
    FROM users u LEFT JOIN wards w ON w.id = u.ward_id LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`, userId);
  const first = `${month}-01`;
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const end = lastDay < today() ? lastDay : today();
  const days = end >= first ? eachDay(first, end) : [];
  const hol = holidaySet(first, lastDay);
  const working = days.filter((d) => !isSunday(d) && !hol.has(d));
  const present = new Set(q.all('SELECT date FROM attendance WHERE user_id = ? AND date BETWEEN ? AND ? AND check_in_at IS NOT NULL', userId, first, end).map((a) => a.date));
  const leaves = q.all("SELECT * FROM leave_requests WHERE user_id = ? AND status = 'approved' AND from_date <= ? AND to_date >= ?", userId, end, first);
  const paidLeave = new Set();
  const unpaidLeave = new Set();
  for (const l of leaves) for (const d of eachDay(l.from_date, l.to_date)) if (working.includes(d) && !present.has(d)) (l.leave_type === 'other' ? unpaidLeave : paidLeave).add(d);
  const presentDays = working.filter((d) => present.has(d)).length;
  const absent = working.filter((d) => !present.has(d) && !paidLeave.has(d)).length; // बिनपगारी रजा = गैरहजर
  const totalDays = eachDay(first, lastDay).length;
  const payable = Math.max(0, totalDays - absent - (eachDay(first, lastDay).length - days.length)); // अजून न आलेले दिवस धरले नाहीत
  const basicFull = u.basic_pay || 0;
  const ratio = totalDays ? payable / totalDays : 0;
  const r2 = (n) => Math.round(n);
  const basic = r2(basicFull * ratio);
  const da = r2(basic * 0.46);
  const hra = r2(basic * 0.1);
  const gross = basic + da + hra;
  const pf = r2((basic + da) * 0.12);
  const pt = gross > 10000 ? 200 : gross > 7500 ? 175 : 0;
  const adv = advanceDeductions(userId, month);
  const advTotal = adv.reduce((s, [, v]) => s + v, 0);
  return {
    employee: u, month, partial: end < lastDay, period: { from: first, to: end, total_days: totalDays },
    attendance: { working_days: working.length, present: presentDays, paid_leave: paidLeave.size, unpaid_leave: unpaidLeave.size, absent, holidays: hol.size, payable_days: payable },
    earnings: [['मूळ वेतन', basic], ['महागाई भत्ता (४६%)', da], ['घरभाडे भत्ता (१०%)', hra]],
    deductions: [['भविष्य निर्वाह निधी (PF १२%)', pf], ['व्यवसाय कर', pt], ...adv],
    gross, total_deductions: pf + pt + advTotal, net: gross - pf - pt - advTotal,
    configured: !!u.basic_pay,
  };
}

r.get('/payslip', (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 7);
  let userId = req.user.id;
  if (req.query.user_id && Number(req.query.user_id) !== req.user.id) {
    const staff = q.get('SELECT id, role, ward_id, department_id FROM users WHERE id = ?', req.query.user_id);
    if (!staff || !canSupervise(req.user, staff)) return res.status(403).json({ message: 'परवानगी नाही' });
    userId = staff.id;
  }
  res.json(payslip(userId, month));
});

// ---------- सुट्ट्या ----------
r.get('/holidays', (req, res) => res.json(q.all("SELECT * FROM holidays WHERE substr(date,1,4) = ? ORDER BY date", req.query.year || String(new Date().getFullYear()))));
r.post('/holidays', requireRole('admin'), (req, res) => {
  const { date, name } = req.body || {};
  if (!isDate(date) || !name) return res.status(400).json({ message: 'तारीख व नाव आवश्यक' });
  q.run('INSERT OR REPLACE INTO holidays (date, name) VALUES (?,?)', date, name);
  res.json({ ok: true });
});

// ---------- परिपत्रके / सूचना फलक ----------
function visibleNoticesSql(user) {
  return {
    sql: `(n.audience_role IS NULL OR n.audience_role = ?) AND (n.department_id IS NULL OR n.department_id = ?) AND (n.ward_id IS NULL OR n.ward_id = ? OR ? IS NULL)`,
    params: [user.role, user.department_id, user.ward_id, user.ward_id],
  };
}

r.get('/notices', (req, res) => {
  const v = visibleNoticesSql(req.user);
  const own = ['officer', 'admin'].includes(req.user.role) ? ' OR n.created_by = ?' : '';
  const params = [req.user.id, ...v.params, ...(own ? [req.user.id] : [])];
  res.json(q.all(`SELECT n.*, u.name AS created_by_name, u.designation AS created_by_designation, d.name AS department_name, w.name AS ward_name,
      (SELECT read_at FROM notice_reads x WHERE x.notice_id = n.id AND x.user_id = ?) AS read_at,
      (SELECT COUNT(*) FROM notice_reads x WHERE x.notice_id = n.id) AS read_count
    FROM notices n JOIN users u ON u.id = n.created_by LEFT JOIN departments d ON d.id = n.department_id LEFT JOIN wards w ON w.id = n.ward_id
    WHERE (${v.sql})${own} ORDER BY n.id DESC LIMIT 100`, ...params));
});

r.post('/notices', requireRole('officer', 'admin'), (req, res) => {
  const { title, body, priority, audience_role, department_id, ward_id } = req.body || {};
  if (!title || !body) return res.status(400).json({ message: 'विषय व मजकूर आवश्यक' });
  // अधिकारी फक्त त्यांच्या विभागासाठी परिपत्रक काढू शकतात
  const dept = req.user.role === 'admin' ? department_id || null : req.user.department_id;
  const ward = req.user.role === 'admin' ? ward_id || null : req.user.ward_id || ward_id || null;
  const role = ['worker', 'clerk', 'officer'].includes(audience_role) ? audience_role : null;
  const id = Number(q.run('INSERT INTO notices (title, body, priority, audience_role, department_id, ward_id, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)',
    title, body, priority === 'urgent' ? 'urgent' : 'normal', role, dept, ward, req.user.id, now()).lastInsertRowid);
  const recipients = q.all(`SELECT id FROM users u WHERE active = 1 AND id <> ? AND (? IS NULL OR role = ?) AND (? IS NULL OR department_id = ?) AND (? IS NULL OR ward_id = ? OR ward_id IS NULL)`,
    req.user.id, role, role, dept, dept, ward, ward);
  for (const u of recipients) notify(u.id, `${priority === 'urgent' ? '🔴 ' : ''}परिपत्रक: ${title}`, body.slice(0, 200), '/notices');
  res.status(201).json({ id, recipients: recipients.length });
});

r.post('/notices/:id/read', (req, res) => {
  q.run('INSERT OR IGNORE INTO notice_reads (notice_id, user_id, read_at) VALUES (?,?,?)', req.params.id, req.user.id, now());
  res.json({ ok: true });
});

r.get('/notices/:id/readers', requireRole('officer', 'admin'), (req, res) => {
  res.json(q.all(`SELECT u.name, u.designation, x.read_at FROM notice_reads x JOIN users u ON u.id = x.user_id WHERE x.notice_id = ? ORDER BY x.read_at`, req.params.id));
});

// ---------- कर्मचारी संपर्क यादी ----------
r.get('/directory', (req, res) => {
  const where = ['u.active = 1'];
  const params = [];
  if (req.query.department_id) { where.push('u.department_id = ?'); params.push(req.query.department_id); }
  if (req.query.ward_id) { where.push('(u.ward_id = ? OR u.ward_id IS NULL)'); params.push(req.query.ward_id); }
  if (req.query.search) { where.push('(u.name LIKE ? OR u.designation LIKE ? OR u.mobile LIKE ?)'); params.push(...Array(3).fill(`%${req.query.search}%`)); }
  res.json(q.all(`SELECT u.id, u.name, u.role, u.designation, u.mobile, w.name AS ward_name, d.name AS department_name
    FROM users u LEFT JOIN wards w ON w.id = u.ward_id LEFT JOIN departments d ON d.id = u.department_id
    WHERE ${where.join(' AND ')} ORDER BY u.role = 'admin' DESC, u.role = 'officer' DESC, u.ward_id IS NOT NULL, d.name, u.name LIMIT 300`, ...params));
});

export default r;
