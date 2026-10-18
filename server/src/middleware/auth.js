import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { q } from '../db.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'कृपया लॉगिन करा' });
  try {
    const { id } = jwt.verify(token, config.jwtSecret);
    const user = q.get('SELECT id, name, mobile, role, designation, ward_id, department_id, active FROM users WHERE id = ?', id);
    if (!user || !user.active) return res.status(401).json({ message: 'खाते निष्क्रिय आहे' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'सत्र संपले आहे, पुन्हा लॉगिन करा' });
  }
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ message: 'या कामासाठी परवानगी नाही' });

// भूमिकेनुसार डेटा मर्यादा: अधिकाऱ्याला फक्त त्यांचा विभाग व प्रभाग दिसतो.
// alias = SQL table alias. Returns { sql, params } to append in WHERE.
export function scopeFilter(user, alias, { ward = 'ward_id', dept = 'department_id' } = {}) {
  const parts = [];
  const params = [];
  if (user.role === 'officer' || user.role === 'clerk') {
    if (dept && user.department_id) { parts.push(`${alias}.${dept} = ?`); params.push(user.department_id); }
    if (ward && user.ward_id) { parts.push(`${alias}.${ward} = ?`); params.push(user.ward_id); }
  }
  return { sql: parts.length ? ' AND ' + parts.join(' AND ') : '', params };
}
