// दैनिक MIS अहवाल: रोज संध्याकाळी (REPORT_HOUR, default १८:००) १ पानी PDF तयार करून
// आयुक्त/Admin ना ई-मेल व WhatsApp वर पाठवला जातो.
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { q, now, today } from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sendWhatsApp } from '../utils/notify.js';
import { sendMail } from '../utils/mail.js';
import { signReport, verifyReport } from '../utils/tokens.js';

const r = Router();
const FONT = path.resolve(config.uploadsDir, '../fonts/Mukta-Regular.ttf');
const FONT_BOLD = path.resolve(config.uploadsDir, '../fonts/Mukta-Bold.ttf');
const REPORTS_DIR = path.join(path.dirname(config.dbFile), 'reports');
const LOGO = path.resolve(config.uploadsDir, '../assets/logo.png');

// भारतीय वेळेनुसार दिवसाची सुरुवात/शेवट (DB मध्ये UTC ISO वेळ आहे)
function dayRange(date) {
  const start = new Date(`${date}T00:00:00+05:30`).toISOString();
  const end = new Date(Date.parse(start) + 864e5).toISOString();
  return [start, end];
}

export function buildSummary(date) {
  const [s, e] = dayRange(date);
  const OPEN = "('new','assigned','in_progress')";
  const g = q.get(`SELECT
      SUM(created_at >= ? AND created_at < ?) AS received,
      SUM(resolved_at >= ? AND resolved_at < ? AND status IN ('resolved','closed')) AS resolved,
      SUM(resolved_at >= ? AND resolved_at < ? AND status IN ('resolved','closed') AND resolved_at <= sla_due_at) AS resolved_on_time,
      SUM(status IN ${OPEN} AND created_at < ?) AS pending,
      SUM(status IN ${OPEN} AND sla_due_at < ? AND created_at < ?) AS overdue
    FROM grievances`, s, e, s, e, s, e, e, e, e);
  const att = q.get(`SELECT COUNT(*) AS workers, SUM(a.check_in_at IS NOT NULL) AS present
    FROM users u LEFT JOIN attendance a ON a.user_id = u.id AND a.date = ? WHERE u.role = 'worker' AND u.active = 1`, date);
  const tax = q.get("SELECT COALESCE(SUM(amount_paid),0) AS amt, COUNT(*) AS n FROM payments WHERE payment_status='SUCCESS' AND paid_at >= ? AND paid_at < ?", s, e);
  const waste = q.get('SELECT ROUND(COALESCE(SUM(tonnes),0),1) AS t FROM waste_trips WHERE at >= ? AND at < ?', s, e).t;
  const alerts = q.get('SELECT COUNT(*) AS c FROM vehicle_alerts WHERE created_at >= ? AND created_at < ?', s, e).c;
  const approvals = q.get('SELECT SUM(decided_at >= ? AND decided_at < ?) AS decided, SUM(status = \'pending\') AS pending FROM applications', s, e);
  const byWard = q.all(`SELECT w.name AS ward,
      SUM(g.created_at >= ? AND g.created_at < ?) AS received,
      SUM(g.resolved_at >= ? AND g.resolved_at < ? AND g.status IN ('resolved','closed')) AS resolved,
      SUM(g.status IN ${OPEN}) AS pending,
      SUM(g.status IN ${OPEN} AND g.sla_due_at < ?) AS overdue
    FROM wards w LEFT JOIN grievances g ON g.ward_id = w.id GROUP BY w.id ORDER BY w.id`, s, e, s, e, e);
  const topWorkers = q.all(`SELECT u.name, w.name AS ward, COUNT(*) AS n FROM grievances g JOIN users u ON u.id = g.assigned_to
    LEFT JOIN wards w ON w.id = u.ward_id WHERE g.resolved_at >= ? AND g.resolved_at < ? AND g.resolved_at <= g.sla_due_at
    GROUP BY u.id ORDER BY n DESC LIMIT 5`, s, e);
  const stuckFiles = q.all(`SELECT f.file_no, f.subject, u.name AS holder, CAST(julianday(?) - julianday(f.received_at) AS INTEGER) AS days
    FROM efiles f LEFT JOIN users u ON u.id = f.current_holder WHERE f.status = 'open' ORDER BY f.received_at LIMIT 5`, e);
  return {
    date, received: g.received || 0, resolved: g.resolved || 0, resolved_on_time: g.resolved_on_time || 0,
    pending: g.pending || 0, overdue: g.overdue || 0, workers: att.workers || 0, present: att.present || 0,
    tax: tax.amt, receipts: tax.n, waste, alerts, approvals_decided: approvals.decided || 0, approvals_pending: approvals.pending || 0,
    byWard, topWorkers, stuckFiles,
  };
}

const money = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');

export function renderPdf(s) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const file = path.join(REPORTS_DIR, `mis-${s.date}.pdf`);
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const stream = fs.createWriteStream(file);
  doc.pipe(stream);
  const W = doc.page.width - 72;
  const blue = '#a63a0b'; // अमरावती ब्रँड रंग

  doc.rect(0, 0, doc.page.width, 70).fill('#7a1f0e');
  if (fs.existsSync(LOGO)) { doc.circle(64, 35, 27).fill('#fff'); doc.image(LOGO, 40, 11, { width: 48, height: 48 }); }
  doc.fillColor('#fff').font(FONT_BOLD).fontSize(20).text('अमरावती महानगरपालिका — दैनिक कामकाज अहवाल', 100, 14);
  doc.font(FONT).fontSize(11).text(`दिनांक: ${new Date(s.date).toLocaleDateString('mr-IN', { dateStyle: 'full' })}   ·   तयार: ${new Date().toLocaleTimeString('mr-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}`, 100, 44);
  doc.fillColor('#1d2433');

  // KPI boxes
  const kpis = [
    ['नवीन तक्रारी', s.received], ['निकाली', s.resolved], ['प्रलंबित', s.pending], ['SLA उशीर', s.overdue],
    ['हजेरी', `${s.present}/${s.workers}`], ['कर संकलन', money(s.tax)], ['कचरा (टन)', s.waste], ['वाहन अलर्ट', s.alerts],
  ];
  const bw = W / 4;
  kpis.forEach(([label, val], i) => {
    const x = 36 + (i % 4) * bw;
    const y = 86 + Math.floor(i / 4) * 62;
    doc.roundedRect(x + 3, y, bw - 6, 54, 6).fillAndStroke(i === 3 && s.overdue ? '#fdecec' : '#f2f6fb', '#dbe3ee');
    doc.fillColor(i === 3 && s.overdue ? '#a12a2a' : blue).font(FONT_BOLD).fontSize(17).text(String(val), x + 12, y + 6, { width: bw - 24 });
    doc.fillColor('#555').font(FONT).fontSize(10).text(label, x + 12, y + 32, { width: bw - 24 });
  });
  doc.fillColor('#1d2433');

  let y = 220;
  const sla = s.resolved ? Math.round((100 * s.resolved_on_time) / s.resolved) : 0;
  doc.font(FONT).fontSize(10.5).text(`आज निकाली काढलेल्यांपैकी ${sla}% तक्रारी वेळेत (SLA) सोडवल्या · कर पावत्या: ${s.receipts} · दाखले/परवाने निर्णय: ${s.approvals_decided} (प्रलंबित ${s.approvals_pending})`, 36, y, { width: W });
  y += 28;

  const table = (title, cols, rows, widths) => {
    doc.font(FONT_BOLD).fontSize(12.5).fillColor(blue).text(title, 36, y);
    y += 20;
    doc.rect(36, y, W, 18).fill('#e8eef7');
    doc.fillColor('#333').font(FONT_BOLD).fontSize(9.5);
    let x = 36;
    cols.forEach((c, i) => { doc.text(c, x + 5, y + 3, { width: widths[i] - 10 }); x += widths[i]; });
    y += 18;
    doc.font(FONT).fontSize(9.5).fillColor('#1d2433');
    if (!rows.length) { doc.fillColor('#888').text('— नोंद नाही —', 41, y + 3); y += 18; }
    rows.forEach((row, ri) => {
      if (ri % 2) doc.rect(36, y, W, 17).fill('#f8fafc').fillColor('#1d2433');
      x = 36;
      row.forEach((c, i) => { doc.fillColor(typeof c === 'object' ? c.color : '#1d2433').text(String(typeof c === 'object' ? c.v : c), x + 5, y + 3, { width: widths[i] - 10, lineBreak: false, ellipsis: true }); x += widths[i]; });
      y += 17;
    });
    doc.fillColor('#1d2433');
    y += 12;
  };

  table('प्रभागनिहाय तक्रारी', ['प्रभाग', 'आज आलेल्या', 'आज निकाली', 'एकूण प्रलंबित', 'SLA उशीर'],
    s.byWard.map((w) => [w.ward, w.received || 0, w.resolved || 0, w.pending || 0, w.overdue ? { v: w.overdue, color: '#c03030' } : 0]),
    [W * 0.36, W * 0.16, W * 0.16, W * 0.16, W * 0.16]);
  table('आजचे सर्वोत्तम कर्मचारी (वेळेत काम पूर्ण)', ['कर्मचारी', 'प्रभाग', 'कामे'],
    s.topWorkers.map((t) => [t.name, t.ward, t.n]), [W * 0.45, W * 0.4, W * 0.15]);
  table('सर्वात जास्त काळ प्रलंबित फाईल्स', ['फाईल', 'विषय', 'कोणाकडे', 'दिवस'],
    s.stuckFiles.map((f) => [f.file_no, f.subject, f.holder, f.days > 7 ? { v: f.days, color: '#c03030' } : f.days]),
    [W * 0.2, W * 0.45, W * 0.25, W * 0.1]);

  doc.fontSize(8.5).fillColor('#888').text('हा अहवाल मनपा ई-गव्हर्नन्स प्रणालीने आपोआप तयार केला आहे.', 36, doc.page.height - 50, { width: W, align: 'center' });
  doc.end();
  return new Promise((resolve, reject) => { stream.on('finish', () => resolve(file)); stream.on('error', reject); });
}

export async function generateAndSend(date = today(), { send = true } = {}) {
  const summary = buildSummary(date);
  const file = await renderPdf(summary);
  const recipients = q.all("SELECT id, name, mobile, email FROM users WHERE role = 'admin' AND active = 1");
  const sentTo = [];
  if (send) {
    const link = `${config.appUrl}/api/reports/${date}/pdf?token=${signReport(date)}`;
    const caption = `📊 *दैनिक अहवाल ${date}*\nनवीन तक्रारी: ${summary.received} · निकाली: ${summary.resolved} · प्रलंबित: ${summary.pending} (उशीर ${summary.overdue})\nहजेरी: ${summary.present}/${summary.workers} · कर: ${money(summary.tax)}`;
    for (const u of recipients) {
      if (u.mobile) { sendWhatsApp(u.mobile, caption, { link, filename: `MIS-${date}.pdf` }); sentTo.push(`whatsapp:${u.mobile}`); }
    }
    const emails = recipients.map((u) => u.email).filter(Boolean);
    if (emails.length) {
      await sendMail({ to: emails, subject: `मनपा दैनिक अहवाल — ${date}`, html: `<p>${caption.replace(/\*/g, '').replace(/\n/g, '<br>')}</p>`, attachments: [{ filename: `MIS-${date}.pdf`, path: file }] });
      sentTo.push(...emails.map((e) => `email:${e}`));
    }
  }
  q.run(`INSERT INTO daily_reports (report_date, file_path, summary, sent_to, created_at) VALUES (?,?,?,?,?)
    ON CONFLICT(report_date) DO UPDATE SET file_path=excluded.file_path, summary=excluded.summary, sent_to=COALESCE(excluded.sent_to, sent_to), created_at=excluded.created_at`,
    date, file, JSON.stringify(summary), sentTo.length ? sentTo.join(', ') : null, now());
  console.log(`📊 दैनिक अहवाल तयार: ${file}${sentTo.length ? ` → ${sentTo.length} जणांना पाठवला` : ''}`);
  return { file, summary };
}

export function scheduleDailyReport() {
  const hour = Number(process.env.REPORT_HOUR || 18);
  let last = null;
  setInterval(() => {
    const ist = new Date(Date.now() + 5.5 * 3600e3);
    const date = ist.toISOString().slice(0, 10);
    if (ist.getUTCHours() === hour && last !== date) {
      last = date;
      generateAndSend(date).catch((e) => console.error('दैनिक अहवाल त्रुटी:', e.message));
    }
  }, 60e3).unref();
}

// PDF डाऊनलोड — WhatsApp लिंकमधील token किंवा लॉगिन
r.get('/:date/pdf', (req, res, next) => {
  if (req.query.token) {
    try { if (verifyReport(req.query.token).date !== req.params.date) throw new Error(); } catch { return res.status(403).json({ message: 'लिंक कालबाह्य' }); }
    return next();
  }
  requireAuth(req, res, () => requireRole('officer', 'admin')(req, res, next));
}, async (req, res, next) => {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) return res.status(400).json({ message: 'चुकीची तारीख' });
    let row = q.get('SELECT file_path FROM daily_reports WHERE report_date = ?', req.params.date);
    // आजचा अहवाल नेहमी ताजा तयार करा
    if (!row || !fs.existsSync(row.file_path) || req.params.date === today()) {
      await generateAndSend(req.params.date, { send: false });
      row = q.get('SELECT file_path FROM daily_reports WHERE report_date = ?', req.params.date);
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="MIS-${req.params.date}.pdf"`);
    fs.createReadStream(row.file_path).pipe(res);
  } catch (e) { next(e); }
});

r.use(requireAuth, requireRole('officer', 'admin'));

r.get('/', (req, res) => {
  res.json(q.all('SELECT id, report_date, summary, sent_to, created_at FROM daily_reports ORDER BY report_date DESC LIMIT 60')
    .map((x) => ({ ...x, summary: JSON.parse(x.summary) })));
});

r.get('/summary', (req, res) => res.json(buildSummary(req.query.date || today())));

r.post('/send-now', requireRole('admin'), async (req, res, next) => {
  try { const { summary } = await generateAndSend(req.body?.date || today()); res.json({ ok: true, summary }); } catch (e) { next(e); }
});

export default r;
