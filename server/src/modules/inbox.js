// "माझ्याकडे प्रलंबित" — प्रत्येक कर्मचाऱ्याचे आजचे बाकी असलेले सर्व काम एकाच ठिकाणी
import { Router } from 'express';
import { q, today } from '../db.js';
import { requireAuth, scopeFilter } from '../middleware/auth.js';
import { canSupervise } from '../utils/hierarchy.js';

const r = Router();
r.use(requireAuth);

const OPEN = "('new','assigned','in_progress')";
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

r.get('/', (req, res) => {
  const u = req.user;
  const items = [];
  const add = (key, icon, label, count, link, tone = '') => { if (count > 0) items.push({ key, icon, label, count, link, tone }); };
  const att = q.get('SELECT check_in_at, check_out_at FROM attendance WHERE user_id = ? AND date = ?', u.id, today());

  // सर्वांसाठी — सुरू असलेल्या आपत्कालीन घटना
  add('emergency', '🚨', 'सुरू असलेल्या आपत्कालीन घटना', q.get("SELECT COUNT(*) AS c FROM emergencies WHERE status = 'active'").c, '/emergencies', 'danger');
  const unreadNotices = q.get(`SELECT COUNT(*) AS c FROM notices n WHERE n.created_by <> ?
      AND (n.audience_role IS NULL OR n.audience_role = ?) AND (n.department_id IS NULL OR n.department_id = ?) AND (n.ward_id IS NULL OR n.ward_id = ? OR ? IS NULL)
      AND NOT EXISTS (SELECT 1 FROM notice_reads x WHERE x.notice_id = n.id AND x.user_id = ?)`,
  u.id, u.role, u.department_id, u.ward_id, u.ward_id, u.id).c;
  add('notices', '📢', 'न वाचलेली परिपत्रके', unreadNotices, '/notices', 'warn');
  const myOrders = q.get("SELECT COUNT(*) AS c, SUM(due_date < ?) AS late FROM work_orders WHERE assigned_to = ? AND status IN ('assigned','in_progress')", today(), u.id);
  add('my_orders', '🛠️', 'मला दिलेले कामाचे आदेश', myOrders.c, '/work-orders', myOrders.late ? 'danger' : '');

  if (u.role === 'worker') {
    const t = q.get(`SELECT COUNT(*) AS c, SUM(sla_due_at < ${NOW}) AS late FROM grievances WHERE assigned_to = ? AND status IN ${OPEN}`, u.id);
    add('my_tasks', '📋', 'माझ्या तक्रारी (कामे)', t.c, '/tasks', t.late ? 'danger' : '');
  }

  if (['clerk', 'officer', 'admin'].includes(u.role)) {
    const files = q.get("SELECT COUNT(*) AS c, SUM(julianday('now') - julianday(received_at) > 7) AS old FROM efiles WHERE status = 'open' AND current_holder = ?", u.id);
    add('files', '📁', 'माझ्याकडील फाईल्स', files.c, '/efiles', files.old ? 'danger' : '');
  }

  if (u.role === 'clerk') {
    const a = scopeFilter(u, 'a');
    add('apps_pending', '📝', 'विभागातील प्रलंबित अर्ज', q.get(`SELECT COUNT(*) AS c FROM applications a WHERE a.status = 'pending'${a.sql}`, ...a.params).c, '/approvals');
  }

  if (['officer', 'admin'].includes(u.role)) {
    const g = scopeFilter(u, 'g');
    add('unassigned', '👷', 'नेमणूक न झालेल्या तक्रारी', q.get(`SELECT COUNT(*) AS c FROM grievances g WHERE g.status = 'new'${g.sql}`, ...g.params).c, '/grievances?status=new', 'danger');
    add('review', '🔍', 'काम पूर्ण — तपासणी बाकी', q.get(`SELECT COUNT(*) AS c FROM grievances g WHERE g.status = 'resolved'${g.sql}`, ...g.params).c, '/grievances?status=resolved', 'warn');
    add('overdue', '⏰', 'SLA ओलांडलेल्या तक्रारी', q.get(`SELECT COUNT(*) AS c FROM grievances g WHERE g.status IN ${OPEN} AND g.sla_due_at < ${NOW}${g.sql}`, ...g.params).c, '/grievances?overdue=1', 'danger');
    const a = scopeFilter(u, 'a');
    add('apps', '✍️', 'मंजुरीसाठी दाखले / परवाने', q.get(`SELECT COUNT(*) AS c FROM applications a WHERE a.status = 'pending'${a.sql}`, ...a.params).c, '/approvals', 'warn');

    const pendingFor = (table, alias) => q.all(`SELECT ${alias}.approver_id, u.id AS uid, u.role, u.ward_id, u.department_id FROM ${table} ${alias}
      JOIN users u ON u.id = ${alias}.user_id WHERE ${alias}.status = 'pending'`)
      .filter((x) => x.approver_id === u.id || canSupervise(u, { id: x.uid, role: x.role, ward_id: x.ward_id, department_id: x.department_id })).length;
    add('leave', '🏖️', 'रजा अर्ज मंजुरी', pendingFor('leave_requests', 'l'), '/approvals-hr', 'warn');
    add('materials', '📦', 'साहित्य मागणी मंजुरी', pendingFor('material_requests', 'm'), '/approvals-hr?tab=materials', 'warn');
    add('advance', '💰', 'अग्रीम / कर्ज अर्ज मंजुरी', pendingFor('advance_requests', 'r'), '/approvals-hr?tab=advance', 'warn');
    add('inspections', '🔎', 'आजच्या तपासणी भेटी', q.get("SELECT COUNT(*) AS c FROM inspections WHERE officer_id = ? AND scheduled_date = ? AND status = 'scheduled'", u.id, today()).c, '/inspections', '');
    add('wo_verify', '🛠️', 'पूर्ण झालेले आदेश — तपासा', q.get(`SELECT COUNT(*) AS c FROM work_orders WHERE status = 'done'${u.role === 'admin' ? '' : ' AND assigned_by = ?'}`, ...(u.role === 'admin' ? [] : [u.id])).c, '/work-orders?status=done', 'warn');
    const wardOnly = u.role === 'officer' && u.ward_id;
    add('alerts', '🚨', 'वाहन अलर्ट', q.get(`SELECT COUNT(*) AS c FROM vehicle_alerts a JOIN vehicles v ON v.id = a.vehicle_id WHERE a.resolved = 0${wardOnly ? ' AND v.ward_id = ?' : ''}`, ...(wardOnly ? [u.ward_id] : [])).c, '/fleet', 'danger');

    // आज हजर नसलेले कर्मचारी
    const params = [today(), today()];
    let where = "u.role IN ('worker','clerk') AND u.active = 1";
    if (u.role === 'officer') { where += ' AND u.department_id = ?'; params.push(u.department_id); if (u.ward_id) { where += ' AND u.ward_id = ?'; params.push(u.ward_id); } }
    add('absent', '🙋', 'आज गैरहजर (रजा नसताना)', q.get(`SELECT COUNT(*) AS c FROM users u WHERE ${where}
      AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.user_id = u.id AND a.date = ? AND a.check_in_at IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM leave_requests l WHERE l.user_id = u.id AND l.status = 'approved' AND ? BETWEEN l.from_date AND l.to_date)`, ...params).c, '/attendance-report');
  }

  const onLeaveToday = q.get("SELECT leave_type FROM leave_requests WHERE user_id = ? AND status = 'approved' AND ? BETWEEN from_date AND to_date", u.id, today());
  res.json({
    attendance: { checked_in: !!att?.check_in_at, checked_out: !!att?.check_out_at, check_in_at: att?.check_in_at, on_leave: !!onLeaveToday },
    items,
    total: items.reduce((s, i) => s + i.count, 0),
  });
});

export default r;
