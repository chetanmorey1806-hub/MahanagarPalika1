// मनपा कार्यालयीन उतरंड: रजा / साहित्य मागणी कोणाकडे मंजुरीसाठी जाईल
//   कर्मचारी / लिपिक → त्याच प्रभाग+विभागाचे अधिकारी → विभाग प्रमुख → आयुक्त
//   वॉर्ड अधिकारी    → विभाग प्रमुख → आयुक्त
//   विभाग प्रमुख     → आयुक्त
import { q } from '../db.js';

export function approverFor(user) {
  const find = (sql, ...p) => q.get(sql, ...p)?.id;
  let id;
  if (user.role === 'worker' || user.role === 'clerk') {
    id = user.ward_id && find("SELECT id FROM users WHERE role='officer' AND active=1 AND department_id=? AND ward_id=? AND id<>? LIMIT 1", user.department_id, user.ward_id, user.id);
  }
  if (!id && user.role !== 'admin' && !(user.role === 'officer' && !user.ward_id)) {
    id = find("SELECT id FROM users WHERE role='officer' AND active=1 AND department_id=? AND ward_id IS NULL AND id<>? LIMIT 1", user.department_id, user.id);
  }
  return id || find("SELECT id FROM users WHERE role='admin' AND active=1 AND id<>? ORDER BY id LIMIT 1", user.id) || null;
}

// अधिकारी हा या कर्मचाऱ्याचा वरिष्ठ आहे का (मंजुरी देण्यास पात्र)
export function canSupervise(officer, staff) {
  if (officer.role === 'admin') return true;
  if (officer.role !== 'officer' || officer.id === staff.id) return false;
  if (officer.department_id !== staff.department_id) return false;
  return !officer.ward_id || officer.ward_id === staff.ward_id;
}

export const STAFF_ROLES = ['worker', 'clerk', 'officer', 'admin'];
export const OFFICE_ROLES = ['clerk', 'officer', 'admin'];
