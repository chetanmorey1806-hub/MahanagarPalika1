// विभागनिहाय अर्थसंकल्प (Budget) विरुद्ध प्रत्यक्ष खर्च (Expenditure)
import { Router } from 'express';
import { q, now } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { currentFY } from './tax.js';

const r = Router();
r.use(requireAuth, requireRole('officer', 'admin'));

export function budgetSummary(fy, deptId) {
  const where = deptId ? ' WHERE d.id = ?' : '';
  return q.all(`SELECT d.id, d.name, d.icon,
      COALESCE((SELECT budget_amount FROM dept_budgets b WHERE b.department_id = d.id AND b.financial_year = ?), 0) AS budget,
      COALESCE((SELECT SUM(amount) FROM expenditures e WHERE e.department_id = d.id AND e.financial_year = ?), 0) AS spent
    FROM departments d${where} ORDER BY d.id`, fy, fy, ...(deptId ? [deptId] : []))
    .map((x) => ({ ...x, pct: x.budget ? Math.round((100 * x.spent) / x.budget) : 0 }));
}

r.get('/', (req, res) => {
  const fy = /^\d{4}-\d{4}$/.test(req.query.fy || '') ? req.query.fy : currentFY();
  const dept = req.user.role === 'admin' ? null : req.user.department_id;
  const rows = budgetSummary(fy, dept);
  const recent = q.all(`SELECT e.*, d.name AS department_name, u.name AS created_by_name FROM expenditures e
    JOIN departments d ON d.id = e.department_id LEFT JOIN users u ON u.id = e.created_by
    WHERE e.financial_year = ?${dept ? ' AND e.department_id = ?' : ''} ORDER BY e.spent_at DESC, e.id DESC LIMIT 50`, fy, ...(dept ? [dept] : []));
  const total = rows.reduce((t, x) => ({ budget: t.budget + x.budget, spent: t.spent + x.spent }), { budget: 0, spent: 0 });
  res.json({ fy, rows, total, recent });
});

r.post('/expenditure', (req, res) => {
  const { department_id, amount, head, description, spent_at } = req.body || {};
  const dept = req.user.role === 'admin' ? Number(department_id) : req.user.department_id;
  if (!dept || !(amount > 0) || !head) return res.status(400).json({ message: 'विभाग, खर्चाचा प्रकार व रक्कम आवश्यक' });
  q.run('INSERT INTO expenditures (department_id, financial_year, amount, head, description, spent_at, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)',
    dept, currentFY(new Date(spent_at || Date.now())), amount, head, description, spent_at || now().slice(0, 10), req.user.id, now());
  res.status(201).json({ ok: true });
});

r.post('/budget', requireRole('admin'), (req, res) => {
  const { department_id, financial_year, budget_amount } = req.body || {};
  if (!department_id || !(budget_amount >= 0)) return res.status(400).json({ message: 'विभाग व रक्कम आवश्यक' });
  q.run(`INSERT INTO dept_budgets (department_id, financial_year, budget_amount) VALUES (?,?,?)
    ON CONFLICT(department_id, financial_year) DO UPDATE SET budget_amount = excluded.budget_amount`, department_id, financial_year || currentFY(), budget_amount);
  res.json({ ok: true });
});

export default r;
