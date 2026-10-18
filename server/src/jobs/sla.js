// SLA Escalation: वेळेत काम न झाल्यास आपोआप वरिष्ठांकडे
//  स्तर १ → संबंधित वॉर्ड/विभाग अधिकारी
//  स्तर २ → विभाग प्रमुख (वॉर्ड नसलेला विभाग अधिकारी)
//  स्तर ३ → आयुक्त / Admin
// प्रत्येक स्तरानंतर SLA च्या अर्ध्या वेळेने पुढील escalation.
import { q, now } from '../db.js';
import { notify, notifyRole } from '../utils/notify.js';

export function runSlaCheck() {
  const due = q.all(`SELECT g.*, c.name AS category, c.sla_hours, w.name AS ward_name FROM grievances g
    JOIN categories c ON c.id = g.category_id LEFT JOIN wards w ON w.id = g.ward_id
    WHERE g.status IN ('new','assigned','in_progress') AND g.escalation_level < 3
      AND g.sla_due_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')`);

  for (const g of due) {
    const stepMs = (g.sla_hours * 3600e3) / 2;
    if (g.escalated_at && Date.now() - Date.parse(g.escalated_at) < stepMs) continue;
    const level = g.escalation_level + 1;
    const hoursLate = Math.round((Date.now() - Date.parse(g.sla_due_at)) / 3600e3);
    const title = `⚠️ SLA भंग (स्तर ${level}): ${g.ticket_no}`;
    const msg = `${g.category} — ${g.ward_name || ''}, ${hoursLate} तास उशीर`;

    q.run('UPDATE grievances SET escalation_level = ?, escalated_at = ? WHERE id = ?', level, now(), g.id);
    q.run('INSERT INTO grievance_logs (grievance_id, user_id, action, note, created_at) VALUES (?,?,?,?,?)',
      g.id, null, 'escalated', `स्तर ${level} वर escalate (${hoursLate} तास उशीर)`, now());

    if (g.assigned_to) notify(g.assigned_to, title, `तुमचे काम वेळेत पूर्ण झाले नाही. ${msg}`, `/tasks/${g.id}`);
    if (level === 1) {
      notify(g.officer_id, title, msg, `/grievances/${g.id}`);
    } else if (level === 2) {
      const head = q.get("SELECT id FROM users WHERE role='officer' AND active=1 AND department_id=? AND ward_id IS NULL LIMIT 1", g.department_id);
      if (head) notify(head.id, title, msg, `/grievances/${g.id}`);
      else notifyRole('admin', title, msg, `/grievances/${g.id}`);
    } else {
      notifyRole('admin', title, msg, `/grievances/${g.id}`);
    }
  }
  return due.length;
}
