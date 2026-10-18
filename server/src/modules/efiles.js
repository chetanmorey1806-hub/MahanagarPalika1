// ई-ऑफिस फाईल ट्रॅकिंग: कोणती फाईल कोणाकडे, किती दिवसांपासून प्रलंबित
import { Router } from 'express';
import { q, tx, now, nextNumber } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { notify } from '../utils/notify.js';

const r = Router();
r.use(requireAuth, requireRole('clerk', 'officer', 'admin'));

const SELECT = `SELECT f.*, d.name AS department_name, h.name AS holder_name, h.designation AS holder_designation, c.name AS creator_name,
    CAST(julianday('now') - julianday(f.received_at) AS INTEGER) AS days_pending
  FROM efiles f
  LEFT JOIN departments d ON d.id = f.department_id
  LEFT JOIN users h ON h.id = f.current_holder
  LEFT JOIN users c ON c.id = f.created_by`;

r.get('/', (req, res) => {
  const { box = 'inbox', status } = req.query;
  const params = [];
  let sql = `${SELECT} WHERE 1=1`;
  if (box === 'inbox') { sql += ' AND f.current_holder = ?'; params.push(req.user.id); }
  else if (box === 'sent') { sql += ' AND f.id IN (SELECT file_id FROM efile_movements WHERE from_user = ?) AND f.current_holder != ?'; params.push(req.user.id, req.user.id); }
  else if (box === 'all' && req.user.role !== 'admin') { sql += ' AND f.department_id = ?'; params.push(req.user.department_id); }
  if (status) { sql += ' AND f.status = ?'; params.push(status); }
  sql += " ORDER BY f.status = 'open' DESC, f.priority = 'urgent' DESC, days_pending DESC LIMIT 300";
  res.json(q.all(sql, ...params));
});

r.post('/', (req, res) => {
  const { subject, priority, department_id } = req.body || {};
  if (!subject) return res.status(400).json({ message: 'फाईलचा विषय लिहा' });
  const at = now();
  const id = tx(() => {
    const info = q.run(`INSERT INTO efiles (file_no, subject, department_id, priority, created_by, current_holder, received_at, created_at)
      VALUES (?,?,?,?,?,?,?,?)`, nextNumber('FILE', 'efiles', 'file_no'), subject, department_id || req.user.department_id,
      priority === 'urgent' ? 'urgent' : 'normal', req.user.id, req.user.id, at, at);
    const fid = Number(info.lastInsertRowid);
    q.run('INSERT INTO efile_movements (file_id, from_user, to_user, action, remark, moved_at) VALUES (?,?,?,?,?,?)', fid, null, req.user.id, 'created', 'फाईल तयार केली', at);
    return fid;
  });
  res.status(201).json({ id });
});

r.get('/:id', (req, res) => {
  const f = q.get(`${SELECT} WHERE f.id = ?`, req.params.id);
  if (!f) return res.status(404).json({ message: 'फाईल सापडली नाही' });
  f.movements = q.all(`SELECT m.*, fu.name AS from_name, tu.name AS to_name, tu.designation AS to_designation,
      CAST(ROUND((julianday(COALESCE(LEAD(m.moved_at) OVER (ORDER BY m.id), strftime('%Y-%m-%dT%H:%M:%fZ','now'))) - julianday(m.moved_at)) * 24) AS INTEGER) AS hours_held
    FROM efile_movements m LEFT JOIN users fu ON fu.id = m.from_user LEFT JOIN users tu ON tu.id = m.to_user
    WHERE m.file_id = ? ORDER BY m.id`, f.id);
  res.json(f);
});

r.post('/:id/forward', (req, res) => {
  const f = q.get('SELECT * FROM efiles WHERE id = ?', req.params.id);
  if (!f) return res.status(404).json({ message: 'फाईल सापडली नाही' });
  if (f.current_holder !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ message: 'ही फाईल सध्या तुमच्याकडे नाही' });
  if (f.status !== 'open') return res.status(400).json({ message: 'फाईल बंद आहे' });
  const to = q.get("SELECT id, name FROM users WHERE id = ? AND active = 1 AND role IN ('clerk','officer','admin')", req.body.to_user);
  if (!to) return res.status(400).json({ message: 'फाईल कोणाकडे पाठवायची ते निवडा' });
  const at = now();
  q.run('UPDATE efiles SET current_holder = ?, received_at = ? WHERE id = ?', to.id, at, f.id);
  q.run('INSERT INTO efile_movements (file_id, from_user, to_user, action, remark, moved_at) VALUES (?,?,?,?,?,?)', f.id, req.user.id, to.id, 'forwarded', req.body.remark, at);
  notify(to.id, `फाईल प्राप्त: ${f.file_no}`, `${f.subject} — ${req.user.name} यांच्याकडून`, `/efiles/${f.id}`);
  res.json({ ok: true });
});

r.post('/:id/close', (req, res) => {
  const f = q.get('SELECT * FROM efiles WHERE id = ?', req.params.id);
  if (!f) return res.status(404).json({ message: 'फाईल सापडली नाही' });
  if (f.current_holder !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ message: 'ही फाईल सध्या तुमच्याकडे नाही' });
  q.run("UPDATE efiles SET status = 'closed' WHERE id = ?", f.id);
  q.run('INSERT INTO efile_movements (file_id, from_user, to_user, action, remark, moved_at) VALUES (?,?,?,?,?,?)', f.id, req.user.id, null, 'closed', req.body?.remark || 'फाईल निकाली', now());
  res.json({ ok: true });
});

export default r;
