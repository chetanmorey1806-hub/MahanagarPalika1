// WhatsApp Bot (Meta Cloud API webhook)
// Meta Developer Console मध्ये Webhook URL: https://<तुमचा-domain>/api/whatsapp/webhook, Verify token: WHATSAPP_VERIFY_TOKEN
//
// आज्ञा (मराठी / इंग्रजी दोन्ही चालतात):
//   स्थिती GRV-2026-00012        → तक्रारीची स्थिती (कोणालाही)
//   कामे / tasks                 → माझी आजची कामे (नोंदणीकृत कर्मचारी)
//   मंजूर BRT-2026-00004         → अर्ज मंजूर (अधिकारी, आधी जतन केलेली सही वापरली जाते)
//   नामंजूर BRT-2026-00004 कारण  → अर्ज नामंजूर
//   अहवाल / report               → आजचा सारांश (अधिकारी)
//   मदत / help
import { Router } from 'express';
import crypto from 'node:crypto';
import { q, today } from '../db.js';
import { config } from '../config.js';
import { sendWhatsApp } from '../utils/notify.js';
import { decideApplication } from './approvals.js';
import { buildSummary } from './reports.js';

const r = Router();

const HELP = `🏛️ *मनपा WhatsApp सेवा*
• स्थिती GRV-2026-00001 — तक्रारीची स्थिती
• कामे — माझी प्रलंबित कामे
• मंजूर <अर्ज क्र.> — अर्ज मंजूर करा
• नामंजूर <अर्ज क्र.> <कारण>
• अहवाल — आजचा सारांश`;

const STATUS = { new: 'नवीन', assigned: 'नेमणूक झाली', in_progress: 'काम सुरू', resolved: 'काम पूर्ण', closed: 'बंद', rejected: 'नाकारली' };

export function handleCommand(mobile, text) {
  const msg = text.trim();
  const [cmdRaw, arg, ...rest] = msg.split(/\s+/);
  const cmd = cmdRaw.toLowerCase();
  const user = q.get('SELECT * FROM users WHERE mobile = ? AND active = 1', mobile);

  if (['स्थिती', 'status'].includes(cmd) && arg) {
    const g = q.get(`SELECT g.ticket_no, g.status, g.sla_due_at, c.name AS category, w.name AS ward FROM grievances g
      JOIN categories c ON c.id = g.category_id LEFT JOIN wards w ON w.id = g.ward_id WHERE g.ticket_no = ?`, arg.toUpperCase());
    return g ? `📋 ${g.ticket_no}\n${g.category} — ${g.ward}\nस्थिती: *${STATUS[g.status]}*` : 'तिकीट सापडले नाही.';
  }
  if (!user) return `तुमचा नंबर मनपा प्रणालीत नोंदवलेला नाही.\nतक्रार नोंदवण्यासाठी: ${config.appUrl}/complaint`;

  if (['कामे', 'tasks'].includes(cmd)) {
    const tasks = q.all(`SELECT g.id, g.ticket_no, g.address, c.name AS category FROM grievances g JOIN categories c ON c.id = g.category_id
      WHERE g.assigned_to = ? AND g.status IN ('new','assigned','in_progress') ORDER BY g.sla_due_at LIMIT 10`, user.id);
    if (!tasks.length) return '🎉 तुमची सर्व कामे पूर्ण आहेत.';
    return `📋 *तुमची कामे (${tasks.length})*\n` + tasks.map((t, i) => `${i + 1}. ${t.category} — ${t.address || ''}\n   ${config.appUrl}/tasks/${t.id}`).join('\n');
  }
  if (['मंजूर', 'approve', 'नामंजूर', 'reject'].includes(cmd) && arg) {
    if (!['officer', 'admin'].includes(user.role)) return 'ही आज्ञा फक्त मंजुरी देणाऱ्या अधिकाऱ्यांसाठी आहे.';
    const a = q.get('SELECT id FROM applications WHERE app_no = ?', arg.toUpperCase());
    if (!a) return 'अर्ज सापडला नाही.';
    const approve = ['मंजूर', 'approve'].includes(cmd);
    try {
      const res = decideApplication(user, a.id, { decision: approve ? 'approved' : 'rejected', remark: rest.join(' ') || undefined });
      return `${approve ? '✅ मंजूर' : '✖ नामंजूर'}: ${res.type_name} ${arg.toUpperCase()} (${res.applicant_name})`;
    } catch (e) {
      return `⚠️ ${e.message}${e.message.includes('स्वाक्षरी') ? `\nएकदा App मध्ये सही करा: ${config.appUrl}/approvals/${a.id}` : ''}`;
    }
  }
  if (['अहवाल', 'report'].includes(cmd)) {
    if (user.role === 'worker') return 'ही आज्ञा फक्त अधिकाऱ्यांसाठी आहे.';
    const s = buildSummary(today());
    return `📊 *आजचा सारांश (${s.date})*\nनवीन तक्रारी: ${s.received}\nनिकाली: ${s.resolved}\nप्रलंबित: ${s.pending} (उशीर: ${s.overdue})\nहजेरी: ${s.present}/${s.workers}\nकर संकलन: ₹${Math.round(s.tax).toLocaleString('en-IN')}\nकचरा: ${s.waste} टन`;
  }
  return HELP;
}

// Meta webhook verification
r.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

// येणारे मेसेज
r.post('/webhook', (req, res) => {
  // Meta कडूनच आलेला मेसेज आहे याची खात्री (X-Hub-Signature-256)
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (secret) {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex');
    const got = req.headers['x-hub-signature-256'] || '';
    if (got.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return res.sendStatus(401);
  } else if (process.env.NODE_ENV === 'production') {
    return res.sendStatus(503);
  }
  res.sendStatus(200); // Meta ला लगेच उत्तर द्या
  const messages = req.body?.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages || []) || []) || [];
  for (const m of messages) {
    const text = m.text?.body || m.button?.text || m.interactive?.button_reply?.title;
    if (!text) continue;
    const mobile = String(m.from).replace(/^91/, '');
    try { sendWhatsApp(mobile, handleCommand(mobile, text)); } catch (e) { console.error('WhatsApp bot त्रुटी:', e.message); }
  }
});

// Development: bot तपासण्यासाठी (POST {mobile, text}) — production मध्ये बंद
if (process.env.NODE_ENV !== 'production') {
  r.post('/test', (req, res) => res.json({ reply: handleCommand(String(req.body?.mobile || ''), String(req.body?.text || '')) }));
}

export default r;
