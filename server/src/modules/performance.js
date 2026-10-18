// Gamification: Leaderboard, Star Rating, Best Employee / Best Ward of the Month
//
// गुण (points) = वेळेत पूर्ण काम × १० + उशिरा पूर्ण × ४ + हजेरी दिवस × २
//               + नागरिक रेटिंग बोनस ((सरासरी − ३) × ५ × रेटिंग संख्या) − पुन्हा उघडलेली कामे × ५
// स्टार (१–५) = SLA पालन % व नागरिक रेटिंगवरून
import { Router } from 'express';
import { q } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();
r.use(requireAuth);

const monthOf = (m) => (/^\d{4}-\d{2}$/.test(m || '') ? m : new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 7));
function monthRange(m) {
  const start = new Date(`${m}-01T00:00:00+05:30`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return [start.toISOString(), end.toISOString()];
}

const stars = (slaPct, avgRating) => {
  if (slaPct == null) return 0;
  const s = (slaPct / 100) * 3 + ((avgRating ?? 3.5) / 5) * 2;
  return Math.max(1, Math.min(5, Math.round(s * 2) / 2)); // अर्धा स्टार
};

export function workerStats(month, { wardId, departmentId } = {}) {
  const [s, e] = monthRange(month);
  const where = ["u.role = 'worker'", 'u.active = 1'];
  const params = [s, e, s, e, s, e, s, e, s, e, month];
  if (wardId) { where.push('u.ward_id = ?'); params.push(wardId); }
  if (departmentId) { where.push('u.department_id = ?'); params.push(departmentId); }
  const rows = q.all(`SELECT u.id, u.name, u.designation, u.ward_id, w.name AS ward_name, d.name AS department_name,
      (SELECT COUNT(*) FROM grievances g WHERE g.assigned_to = u.id AND g.status IN ('resolved','closed') AND g.resolved_at >= ? AND g.resolved_at < ? AND g.resolved_at <= g.sla_due_at) AS on_time,
      (SELECT COUNT(*) FROM grievances g WHERE g.assigned_to = u.id AND g.status IN ('resolved','closed') AND g.resolved_at >= ? AND g.resolved_at < ? AND g.resolved_at > g.sla_due_at) AS late,
      (SELECT COALESCE(SUM(g.reopen_count),0) FROM grievances g WHERE g.assigned_to = u.id AND g.created_at >= ? AND g.created_at < ?) AS reopened,
      (SELECT AVG(g.citizen_rating) FROM grievances g WHERE g.assigned_to = u.id AND g.citizen_rating IS NOT NULL AND g.resolved_at >= ? AND g.resolved_at < ?) AS avg_rating,
      (SELECT COUNT(g.citizen_rating) FROM grievances g WHERE g.assigned_to = u.id AND g.resolved_at >= ? AND g.resolved_at < ?) AS ratings,
      (SELECT COUNT(*) FROM attendance a WHERE a.user_id = u.id AND substr(a.date,1,7) = ? AND a.check_in_at IS NOT NULL) AS attendance_days
    FROM users u LEFT JOIN wards w ON w.id = u.ward_id LEFT JOIN departments d ON d.id = u.department_id
    WHERE ${where.join(' AND ')}`, ...params);

  return rows.map((x) => {
    const done = x.on_time + x.late;
    const sla = done ? Math.round((100 * x.on_time) / done) : null;
    const ratingBonus = x.avg_rating ? Math.round((x.avg_rating - 3) * 5 * x.ratings) : 0;
    return {
      ...x,
      avg_rating: x.avg_rating ? Math.round(x.avg_rating * 10) / 10 : null,
      completed: done,
      sla_pct: sla,
      points: x.on_time * 10 + x.late * 4 + x.attendance_days * 2 + ratingBonus - x.reopened * 5,
      stars: stars(sla, x.avg_rating),
    };
  }).sort((a, b) => b.points - a.points || b.on_time - a.on_time).map((x, i) => ({ ...x, rank: i + 1 }));
}

export function wardStats(month) {
  const [s, e] = monthRange(month);
  return q.all(`SELECT w.id, w.name,
      SUM(g.status IN ('resolved','closed') AND g.resolved_at >= ? AND g.resolved_at < ?) AS resolved,
      SUM(g.status IN ('resolved','closed') AND g.resolved_at >= ? AND g.resolved_at < ? AND g.resolved_at <= g.sla_due_at) AS on_time,
      AVG(CASE WHEN g.resolved_at >= ? AND g.resolved_at < ? THEN g.citizen_rating END) AS avg_rating,
      SUM(g.status IN ('new','assigned','in_progress')) AS pending
    FROM wards w LEFT JOIN grievances g ON g.ward_id = w.id GROUP BY w.id`, s, e, s, e, s, e).map((w) => {
    const att = q.get(`SELECT COUNT(DISTINCT u.id) AS workers, COUNT(a.id) AS days FROM users u
      LEFT JOIN attendance a ON a.user_id = u.id AND substr(a.date,1,7) = ? AND a.check_in_at IS NOT NULL
      WHERE u.role = 'worker' AND u.active = 1 AND u.ward_id = ?`, month, w.id);
    const workingDays = Math.max(1, Math.min(26, Math.ceil((Math.min(Date.now(), Date.parse(e)) - Date.parse(s)) / 864e5)));
    const sla = w.resolved ? Math.round((100 * w.on_time) / w.resolved) : 0;
    const attPct = att.workers ? Math.min(100, Math.round((100 * att.days) / (att.workers * workingDays))) : 0;
    const rating = w.avg_rating ? Math.round(w.avg_rating * 10) / 10 : null;
    return { ...w, avg_rating: rating, sla_pct: sla, attendance_pct: attPct, score: Math.round(sla * 0.6 + attPct * 0.2 + ((rating ?? 3.5) / 5) * 20), stars: stars(sla, rating) };
  }).filter((w) => w.resolved || w.pending || w.attendance_pct) // काम सुरू असलेले प्रभागच
    .sort((a, b) => b.score - a.score).map((w, i) => ({ ...w, rank: i + 1 }));
}

r.get('/leaderboard', (req, res) => {
  const month = monthOf(req.query.month);
  const u = req.user;
  // अधिकाऱ्याला त्यांचा विभाग/प्रभाग; कर्मचाऱ्याला संपूर्ण शहराचा leaderboard (प्रेरणेसाठी)
  const scope = u.role === 'officer' ? { wardId: u.ward_id, departmentId: u.department_id }
    : u.role === 'admin' ? { wardId: req.query.ward_id, departmentId: req.query.department_id } : { departmentId: u.department_id };
  res.json({ month, workers: workerStats(month, scope), wards: wardStats(month) });
});

r.get('/me', (req, res) => {
  const month = monthOf(req.query.month);
  const all = workerStats(month, { departmentId: req.user.department_id });
  const me = all.find((x) => x.id === req.user.id) || null;
  res.json({ month, me, total: all.length, top3: all.slice(0, 3).map(({ id, name, ward_name, points, stars }) => ({ id, name, ward_name, points, stars })) });
});

// Employee / Ward of the Month — प्रमाणपत्रासाठी
r.get('/winners', (req, res) => {
  const month = monthOf(req.query.month);
  const workers = workerStats(month).filter((w) => w.completed > 0);
  const wards = wardStats(month);
  res.json({ month, employee: workers[0] || null, runnersUp: workers.slice(1, 3), ward: wards[0] || null });
});

export default r;
