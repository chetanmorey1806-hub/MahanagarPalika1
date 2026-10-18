// Command & Control डॅशबोर्ड (Live MIS)
import { Router } from 'express';
import { q, today } from '../db.js';
import { budgetSummary } from './budget.js';
import { currentFY } from './tax.js';
import { EMERGENCY_TYPES } from './emergencies.js';
import { waterSummary } from './water.js';
import { defaulters } from './tax.js';
import { requireAuth, requireRole, scopeFilter } from '../middleware/auth.js';

const r = Router();
r.use(requireAuth, requireRole('officer', 'admin'));


const OPEN = "('new','assigned','in_progress')";
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

r.get('/', (req, res) => {
  const g = scopeFilter(req.user, 'g');
  const isAdmin = req.user.role === 'admin';
  const wardOnly = req.user.role === 'officer' && req.user.ward_id;

  const grievance = q.get(`SELECT
      COUNT(*) AS total,
      SUM(g.status IN ${OPEN}) AS open,
      SUM(g.status IN ${OPEN} AND g.sla_due_at < ${NOW}) AS overdue,
      SUM(g.status IN ('resolved','closed') AND date(g.resolved_at) = date('now')) AS resolved_today,
      SUM(date(g.created_at) = date('now')) AS new_today,
      SUM(g.escalation_level > 0 AND g.status IN ${OPEN}) AS escalated,
      ROUND(100.0 * SUM(g.status IN ('resolved','closed') AND g.resolved_at <= g.sla_due_at) / NULLIF(SUM(g.status IN ('resolved','closed')),0), 1) AS sla_compliance
    FROM grievances g WHERE 1=1${g.sql}`, ...g.params);

  const byWard = q.all(`SELECT w.name AS ward, SUM(g.status IN ${OPEN}) AS open, SUM(g.status IN ('resolved','closed')) AS resolved,
      SUM(g.status IN ${OPEN} AND g.sla_due_at < ${NOW}) AS overdue
    FROM grievances g JOIN wards w ON w.id = g.ward_id WHERE 1=1${g.sql} GROUP BY w.id ORDER BY w.id`, ...g.params);

  const byCategory = q.all(`SELECT c.name AS category, c.icon, COUNT(*) AS total, SUM(g.status IN ${OPEN}) AS open
    FROM grievances g JOIN categories c ON c.id = g.category_id WHERE 1=1${g.sql} GROUP BY c.id ORDER BY total DESC`, ...g.params);

  const trend = q.all(`SELECT date(g.created_at) AS day, COUNT(*) AS received,
      (SELECT COUNT(*) FROM grievances x WHERE date(x.resolved_at) = date(g.created_at)${g.sql.replaceAll('g.', 'x.')}) AS resolved
    FROM grievances g WHERE g.created_at >= date('now','-13 day')${g.sql} GROUP BY day ORDER BY day`, ...g.params, ...g.params);

  // हजेरी
  const attParams = [today()];
  let attWhere = "u.role='worker' AND u.active=1";
  if (req.user.role === 'officer') {
    attWhere += ' AND u.department_id = ?'; attParams.push(req.user.department_id);
    if (req.user.ward_id) { attWhere += ' AND u.ward_id = ?'; attParams.push(req.user.ward_id); }
  }
  const attendance = q.get(`SELECT COUNT(*) AS total, SUM(a.check_in_at IS NOT NULL) AS present, SUM(a.inside_geofence = 0) AS outside_fence
    FROM users u LEFT JOIN attendance a ON a.user_id = u.id AND a.date = ? WHERE ${attWhere}`, ...attParams);

  // कचरा, कर, वाहने (वॉर्ड स्तरावर फिल्टर)
  const wf = wardOnly ? ' AND ward_id = ?' : '';
  const wp = wardOnly ? [req.user.ward_id] : [];
  const waste = q.get(`SELECT ROUND(COALESCE(SUM(CASE WHEN date(at) = date('now') THEN tonnes END),0),1) AS today,
      ROUND(COALESCE(SUM(tonnes),0),1) AS month FROM waste_trips WHERE at >= date('now','start of month')${wf}`, ...wp);
  const tax = q.get(`SELECT COALESCE(SUM(CASE WHEN date(paid_at) = date('now') THEN amount_paid END),0) AS today,
      COALESCE(SUM(amount_paid),0) AS month, COUNT(*) AS receipts FROM payments
    WHERE payment_status = 'SUCCESS' AND paid_at >= date('now','start of month')${wf}`, ...wp);
  const alerts = q.get(`SELECT COUNT(*) AS c FROM vehicle_alerts a JOIN vehicles v ON v.id = a.vehicle_id
    WHERE a.resolved = 0 AND a.created_at >= date('now')${wardOnly ? ' AND v.ward_id = ?' : ''}`, ...wp).c;
  const vehicles = q.get(`SELECT COUNT(*) AS total, SUM(status='running') AS running, SUM(status='idle') AS idle, SUM(status='maintenance') AS maintenance
    FROM vehicles WHERE 1=1${wf}`, ...wp);

  const pendingApprovals = q.get(`SELECT COUNT(*) AS c FROM applications a WHERE a.status = 'pending'${scopeFilter(req.user, 'a').sql}`, ...scopeFilter(req.user, 'a').params).c;
  const filesInbox = q.get("SELECT COUNT(*) AS c, MAX(CAST(julianday('now') - julianday(received_at) AS INTEGER)) AS oldest FROM efiles WHERE status='open' AND current_holder = ?", req.user.id);
  const filesStuck = isAdmin
    ? q.all(`SELECT f.id, f.file_no, f.subject, u.name AS holder_name, CAST(julianday('now') - julianday(f.received_at) AS INTEGER) AS days
        FROM efiles f LEFT JOIN users u ON u.id = f.current_holder WHERE f.status='open' ORDER BY f.received_at LIMIT 5`)
    : [];

  res.json({ alerts, grievance, byWard, byCategory, trend, attendance, waste, tax, vehicles, pendingApprovals, filesInbox, filesStuck });
});


// ===================== Admin (आयुक्त) डॅशबोर्ड — संपूर्ण शहर =====================
const dayStartIso = (d = today()) => new Date(`${d}T00:00:00+05:30`).toISOString();
const dayEndIso = (d = today()) => new Date(Date.parse(dayStartIso(d)) + 864e5).toISOString();
const fyStartIso = () => new Date(`${currentFY().slice(0, 4)}-04-01T00:00:00+05:30`).toISOString();

r.get('/admin', requireRole('admin'), (req, res) => {
  const t0 = dayStartIso();
  const fy0 = fyStartIso();
  const rev = q.all(`SELECT a.tax_head,
      COALESCE(SUM(CASE WHEN y.paid_at >= ? THEN y.amount_paid END),0) AS today,
      COALESCE(SUM(CASE WHEN y.paid_at >= ? THEN y.amount_paid END),0) AS ytd
    FROM payments y JOIN tax_assessments a ON a.id = y.assessment_id WHERE y.payment_status = 'SUCCESS' GROUP BY a.tax_head`, t0, fy0);
  const revenue = { property: { today: 0, ytd: 0 }, water: { today: 0, ytd: 0 } };
  for (const x of rev) revenue[x.tax_head] = { today: x.today, ytd: x.ytd };
  const demand = q.get('SELECT COALESCE(SUM(total_payable),0) AS d FROM tax_assessments WHERE financial_year = ?', currentFY()).d;

  const g = q.get(`SELECT COUNT(*) AS total, SUM(status IN ('resolved','closed')) AS resolved, SUM(status IN ${OPEN}) AS pending,
      SUM(status IN ${OPEN} AND sla_due_at < ${NOW}) AS overdue, SUM(created_at >= ?) AS today
    FROM grievances WHERE status <> 'rejected'`, t0);
  const files = q.get("SELECT COUNT(*) AS pending, SUM(julianday('now') - julianday(received_at) > 7) AS stuck FROM efiles WHERE status = 'open'");
  const staff = q.get(`SELECT COUNT(*) AS total, SUM(a.check_in_at IS NOT NULL AND a.check_out_at IS NULL) AS on_duty, SUM(a.check_in_at IS NOT NULL) AS present,
      SUM(a.check_in_at IS NULL AND EXISTS (SELECT 1 FROM leave_requests l WHERE l.user_id = u.id AND l.status = 'approved' AND ? BETWEEN l.from_date AND l.to_date)) AS on_leave
    FROM users u LEFT JOIN attendance a ON a.user_id = u.id AND a.date = ? WHERE u.active = 1 AND u.role IN ('worker','clerk')`, today(), today());

  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const points = q.all(`SELECT g.id, g.lat, g.lng, g.status, g.priority, g.ticket_no, g.ward_id, c.name AS category, c.icon FROM grievances g
    JOIN categories c ON c.id = g.category_id WHERE g.lat IS NOT NULL AND (g.status IN ${OPEN} OR (g.status IN ('resolved','closed') AND g.resolved_at >= ?))
    ORDER BY g.id DESC LIMIT 1500`, since30);

  const wards = q.all(`SELECT w.id, w.name, w.lat, w.lng, w.radius_m,
      SUM(g.status IN ${OPEN}) AS open, SUM(g.status IN ${OPEN} AND g.sla_due_at < ${NOW}) AS overdue,
      SUM(g.status IN ('resolved','closed') AND g.resolved_at >= ?) AS resolved_30d,
      ROUND(AVG(CASE WHEN g.status IN ('resolved','closed') AND g.resolved_at >= ? THEN (julianday(g.resolved_at) - julianday(g.created_at)) * 24 END), 1) AS avg_hours,
      ROUND(100.0 * SUM(g.status IN ('resolved','closed') AND g.resolved_at >= ? AND g.resolved_at <= g.sla_due_at) / NULLIF(SUM(g.status IN ('resolved','closed') AND g.resolved_at >= ?), 0)) AS sla_pct
    FROM wards w LEFT JOIN grievances g ON g.ward_id = w.id GROUP BY w.id ORDER BY w.id`, since30, since30, since30, since30);
  const taxByWard = Object.fromEntries(q.all('SELECT ward_id, SUM(amount_paid) AS amt FROM payments WHERE payment_status = \'SUCCESS\' AND paid_at >= ? GROUP BY ward_id', fy0).map((x) => [x.ward_id, x.amt]));
  const maxTax = Math.max(1, ...Object.values(taxByWard));
  const leaderboard = wards.map((w) => {
    const tax = taxByWard[w.id] || 0;
    const speed = w.avg_hours ? Math.max(0, 100 - w.avg_hours * 2) : 0; // जलद = जास्त गुण
    return { ...w, tax_collected: tax, score: Math.round((w.sla_pct || 0) * 0.45 + speed * 0.25 + (100 * tax / maxTax) * 0.3) };
  }).filter((w) => w.open || w.resolved_30d || w.tax_collected) // काम सुरू असलेले प्रभागच क्रमवारीत
    .sort((a, b) => b.score - a.score).map((w, i) => ({ ...w, rank: i + 1 }));

  const slaBreaches = q.all(`SELECT g.id, g.ticket_no, g.priority, g.address, g.sla_due_at, g.escalation_level, c.name AS category, c.icon, w.name AS ward_name, u.name AS assigned_name,
      ROUND((julianday('now') - julianday(g.sla_due_at)) * 24) AS hours_late
    FROM grievances g JOIN categories c ON c.id = g.category_id LEFT JOIN wards w ON w.id = g.ward_id LEFT JOIN users u ON u.id = g.assigned_to
    WHERE g.status IN ${OPEN} AND g.sla_due_at < ${NOW} AND (g.priority = 'high' OR julianday('now') - julianday(g.sla_due_at) > 1)
    ORDER BY g.priority = 'high' DESC, g.sla_due_at LIMIT 10`);
  const emergencies = q.all(`SELECT e.id, e.type, e.severity, e.title, e.location, e.created_at, w.name AS ward_name FROM emergencies e
    LEFT JOIN wards w ON w.id = e.ward_id WHERE e.status = 'active' ORDER BY CASE e.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, e.id DESC LIMIT 8`)
    .map((e) => ({ ...e, icon: EMERGENCY_TYPES[e.type]?.icon, type_name: EMERGENCY_TYPES[e.type]?.name }));

  const trend = q.all(`SELECT date(created_at, '+330 minutes') AS day, COUNT(*) AS received,
      (SELECT COUNT(*) FROM grievances x WHERE date(x.resolved_at, '+330 minutes') = date(g.created_at, '+330 minutes') AND x.status IN ('resolved','closed')) AS resolved
    FROM grievances g WHERE created_at >= ? GROUP BY day ORDER BY day`, new Date(Date.now() - 13 * 864e5).toISOString());

  res.json({
    fy: currentFY(), revenue, demand,
    grievance: { ...g, rate: g.total ? Math.round((1000 * g.resolved) / g.total) / 10 : 0 },
    files, staff, points, wards, leaderboard,
    defaulters: (() => { const d = defaulters({}); return { count: d.length, due: Math.round(d.reduce((s, x) => s + x.total_due, 0)) }; })(),
    water: waterSummary(), budget: budgetSummary(currentFY()), slaBreaches, emergencies, trend,
  });
});

r.get('/ward/:id', (req, res) => {
  const w = q.get('SELECT * FROM wards WHERE id = ?', req.params.id);
  if (!w) return res.status(404).json({ message: 'प्रभाग सापडला नाही' });
  const g = q.get(`SELECT SUM(status IN ${OPEN}) AS open, SUM(status IN ${OPEN} AND sla_due_at < ${NOW}) AS overdue, SUM(status IN ('resolved','closed')) AS resolved FROM grievances WHERE ward_id = ?`, w.id);
  const staff = q.get(`SELECT COUNT(*) AS total, SUM(a.check_in_at IS NOT NULL) AS present FROM users u LEFT JOIN attendance a ON a.user_id = u.id AND a.date = ?
    WHERE u.active = 1 AND u.role IN ('worker','clerk') AND u.ward_id = ?`, today(), w.id);
  const tax = q.get("SELECT COALESCE(SUM(amount_paid),0) AS amt FROM payments WHERE ward_id = ? AND payment_status = 'SUCCESS' AND paid_at >= ?", w.id, fyStartIso()).amt;
  const officers = q.all("SELECT name, designation, mobile FROM users WHERE role = 'officer' AND active = 1 AND ward_id = ?", w.id);
  const top = q.all(`SELECT c.name, c.icon, COUNT(*) AS n FROM grievances g JOIN categories c ON c.id = g.category_id WHERE g.ward_id = ? AND g.status IN ${OPEN} GROUP BY c.id ORDER BY n DESC LIMIT 4`, w.id);
  res.json({ ward: w, grievance: g, staff, tax, officers, top });
});

// ===================== Officer (वॉर्ड अधिकारी / विभाग प्रमुख) डॅशबोर्ड =====================
r.get('/officer', (req, res) => {
  const u = req.user;
  const g = scopeFilter(u, 'g');
  const sel = `SELECT g.id, g.ticket_no, g.status, g.priority, g.address, g.sla_due_at, g.created_at, c.name AS category, c.icon, w.name AS ward_name, a.name AS assigned_name
    FROM grievances g JOIN categories c ON c.id = g.category_id LEFT JOIN wards w ON w.id = g.ward_id LEFT JOIN users a ON a.id = g.assigned_to`;
  const unassigned = q.all(`${sel} WHERE g.status = 'new'${g.sql} ORDER BY g.priority = 'high' DESC, g.created_at LIMIT 10`, ...g.params);
  const dueToday = q.all(`${sel} WHERE g.status IN ${OPEN} AND g.sla_due_at < ?${g.sql} ORDER BY g.sla_due_at LIMIT 15`, dayEndIso(), ...g.params);
  const awaiting = q.all(`${sel} WHERE g.status = 'resolved'${g.sql} ORDER BY g.resolved_at LIMIT 10`, ...g.params);
  const a = scopeFilter(u, 'a');
  const approvals = q.get(`SELECT COUNT(*) AS c FROM applications a WHERE a.status = 'pending'${a.sql}`, ...a.params).c;
  const inspections = q.all("SELECT * FROM inspections WHERE officer_id = ? AND scheduled_date = ? AND status = 'scheduled' ORDER BY scheduled_time", u.id, today());
  const kanban = q.get(`SELECT SUM(g.status IN ('new','assigned')) AS todo, SUM(g.status = 'in_progress') AS doing, SUM(g.status = 'resolved') AS review,
      SUM(g.status = 'closed' AND g.resolved_at >= ?) AS closed_7d FROM grievances g WHERE 1=1${g.sql}`, new Date(Date.now() - 7 * 864e5).toISOString(), ...g.params);
  const vParams = u.ward_id ? [u.ward_id] : [];
  const vehicles = q.all(`SELECT id, reg_no, type, status, last_lat, last_lng, last_speed, last_seen, driver_name FROM vehicles WHERE last_lat IS NOT NULL${u.ward_id ? ' AND ward_id = ?' : ''}`, ...vParams);
  const alerts = q.get(`SELECT COUNT(*) AS c FROM vehicle_alerts x JOIN vehicles v ON v.id = x.vehicle_id WHERE x.resolved = 0${u.ward_id ? ' AND v.ward_id = ?' : ''}`, ...vParams).c;
  const emergencies = q.all(`SELECT id, type, severity, title, location, created_at FROM emergencies WHERE status = 'active'${u.ward_id ? ' AND (ward_id = ? OR ward_id IS NULL)' : ''} ORDER BY id DESC LIMIT 5`, ...vParams)
    .map((e) => ({ ...e, icon: EMERGENCY_TYPES[e.type]?.icon }));
  const routes = q.get(`SELECT COUNT(*) AS total, SUM(EXISTS (SELECT 1 FROM route_completions rc WHERE rc.route_id = vr.id AND rc.date = ?)) AS completed
    FROM vehicle_routes vr JOIN vehicles v ON v.id = vr.vehicle_id WHERE vr.active = 1${u.ward_id ? ' AND v.ward_id = ?' : ''}`, today(), ...vParams);
  const water = waterSummary(u.ward_id);
  res.json({ unassigned, dueToday, awaiting, approvals, inspections, kanban, vehicles, alerts, emergencies, routes, water });
});

export default r;
