// पाणीपुरवठा विभाग:
//  (१) मीटर रीडिंग — मीटर रीडर फोटो काढतो, आकडे मोबाईलवर OCR ने ओळखले जातात, जागेवरच बिल तयार
//  (२) टँकर फेरी — नागरिकाला OTP जातो; टँकर पोहोचल्यावर OTP + GPS ने डिलिव्हरीची नोंद
import { Router } from 'express';
import crypto from 'node:crypto';
import { q, now, today, audit, nextNumber } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { encrypt, decrypt, maskMobile, sha256 } from '../utils/crypto.js';
import { distanceMeters, findWard } from '../utils/geo.js';
import { saveDataUrl } from '../utils/files.js';
import { notify, sendWhatsApp } from '../utils/notify.js';
import { config } from '../config.js';
import { emit } from '../live.js';

const r = Router();
r.use(requireAuth);
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

// ---------------- दर (प्रति युनिट = १००० लिटर) ----------------
export const WATER_TARIFF = {
  slabs: [[10, 7], [30, 12], [Infinity, 20]], // पहिले १० युनिट ₹७, ११–३० ₹१२, ३० पुढे ₹२०
  commercialFactor: 2.5,
  meterRent: 30,
};
export function waterBill(units, propertyType) {
  let left = units; let from = 0; const rows = [];
  const factor = ['COMMERCIAL', 'INDUSTRIAL'].includes(propertyType) ? WATER_TARIFF.commercialFactor : 1;
  for (const [upto, rate] of WATER_TARIFF.slabs) {
    if (left <= 0) break;
    const u = Math.min(left, upto - from);
    rows.push({ label: upto === Infinity ? `${from}+ युनिट` : `${from + 1}–${upto} युनिट`, units: Math.round(u * 100) / 100, rate: rate * factor, amount: Math.round(u * rate * factor) });
    left -= u; from = upto;
  }
  rows.push({ label: 'मीटर भाडे', units: null, rate: null, amount: WATER_TARIFF.meterRent });
  return { rows, total: rows.reduce((s, x) => s + x.amount, 0) };
}

const METER_SELECT = `SELECT m.*, p.property_no, p.owner_name, p.address, p.property_type, p.ward_id, p.owner_mobile_enc, p.lat AS p_lat, p.lng AS p_lng, w.name AS ward_name
  FROM water_meters m JOIN properties p ON p.id = m.property_id LEFT JOIN wards w ON w.id = p.ward_id`;
const meterView = (m) => { const o = { ...m, owner_mobile: maskMobile(decrypt(m.owner_mobile_enc)) }; delete o.owner_mobile_enc; return o; };

r.get('/tariff', (req, res) => res.json(WATER_TARIFF));

r.get('/meters', (req, res) => {
  const params = [];
  let where = '1=1';
  if (req.user.ward_id && req.user.role !== 'admin') { where += ' AND p.ward_id = ?'; params.push(req.user.ward_id); }
  if (req.query.search) { where += ' AND (m.meter_no LIKE ? OR p.property_no LIKE ? OR p.owner_name LIKE ? OR p.address LIKE ?)'; params.push(...Array(4).fill(`%${req.query.search}%`)); }
  if (req.query.due === '1') { where += ' AND (m.last_read_at IS NULL OR m.last_read_at < ?)'; params.push(new Date(Date.now() - 25 * 864e5).toISOString()); }
  res.json(q.all(`${METER_SELECT} WHERE ${where} ORDER BY m.last_read_at IS NOT NULL, m.last_read_at, p.property_no LIMIT 100`, ...params).map(meterView));
});

r.get('/meters/:id', (req, res) => {
  const m = q.get(`${METER_SELECT} WHERE m.id = ?`, req.params.id);
  if (!m) return res.status(404).json({ message: 'मीटर सापडला नाही' });
  const readings = q.all(`SELECT x.*, u.name AS read_by_name FROM meter_readings x LEFT JOIN users u ON u.id = x.read_by WHERE x.meter_id = ? ORDER BY x.id DESC LIMIT 12`, m.id);
  res.json({ ...meterView(m), readings });
});

// मीटर रीडिंग + जागेवरच बिल
r.post('/meters/:id/reading', (req, res, next) => {
  try {
    const m = q.get(`${METER_SELECT} WHERE m.id = ?`, req.params.id);
    if (!m) fail(404, 'मीटर सापडला नाही');
    const { reading, photo, ocr_value, ocr_confidence, lat, lng, capturedAt } = req.body || {};
    const value = Math.round(Number(reading) * 100) / 100;
    if (!Number.isFinite(value) || value < 0) fail(400, 'मीटरचा आकडा योग्य टाका');
    if (!photo) fail(400, 'मीटरचा फोटो आवश्यक आहे');
    if (value < m.last_reading) fail(400, `नवीन आकडा मागील आकड्यापेक्षा (${m.last_reading}) कमी आहे — पुन्हा तपासा`);
    if (value - m.last_reading > 500) fail(400, 'वापर खूप जास्त दिसतो (५०० युनिटपेक्षा जास्त) — आकडा पुन्हा तपासा');
    const units = Math.round((value - m.last_reading) * 100) / 100;
    const bill = waterBill(units, m.property_type);
    const at = capturedAt && Math.abs(Date.now() - Date.parse(capturedAt)) < 864e5 ? new Date(capturedAt).toISOString() : now();
    const due = new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10);
    const billNo = nextNumber('WB', 'meter_readings', 'bill_no');
    const id = Number(q.run(`INSERT INTO meter_readings (meter_id, reading, previous, units, photo, ocr_value, ocr_confidence, manual_override, lat, lng, read_by, read_at,
        bill_no, bill_amount, bill_breakup, due_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    m.id, value, m.last_reading, units, saveDataUrl(photo, 'meters'), ocr_value ?? null, ocr_confidence ?? null,
    ocr_value != null && String(ocr_value) !== String(reading) ? 1 : 0, lat, lng, req.user.id, at, billNo, bill.total, JSON.stringify(bill.rows), due).lastInsertRowid);
    q.run('UPDATE water_meters SET last_reading = ?, last_read_at = ? WHERE id = ?', value, at, m.id);
    const mobile = decrypt(m.owner_mobile_enc);
    if (mobile) sendWhatsApp(mobile, `💧 *अमरावती महानगरपालिका — पाणी बिल*\nबिल क्र. ${billNo}\nमीटर ${m.meter_no} · वापर ${units} युनिट\nरक्कम: ₹${bill.total} · अंतिम तारीख ${due}\n${config.appUrl}/pay-tax`);
    audit(req.user.id, 'meter_reading', 'meter_reading', id);
    res.status(201).json({ id, bill_no: billNo, units, amount: bill.total, rows: bill.rows, due_date: due });
  } catch (e) { next(e); }
});

r.get('/readings', requireRole('clerk', 'officer', 'admin'), (req, res) => {
  const params = [];
  let where = '1=1';
  if (req.user.role !== 'admin' && req.user.ward_id) { where += ' AND p.ward_id = ?'; params.push(req.user.ward_id); }
  if (req.query.status) { where += ' AND x.bill_status = ?'; params.push(req.query.status); }
  res.json(q.all(`SELECT x.id, x.bill_no, x.reading, x.previous, x.units, x.bill_amount, x.bill_status, x.read_at, x.due_date, x.manual_override, x.photo,
      m.meter_no, p.property_no, p.owner_name, w.name AS ward_name, u.name AS read_by_name
    FROM meter_readings x JOIN water_meters m ON m.id = x.meter_id JOIN properties p ON p.id = m.property_id
    LEFT JOIN wards w ON w.id = p.ward_id LEFT JOIN users u ON u.id = x.read_by WHERE ${where} ORDER BY x.id DESC LIMIT 200`, ...params));
});

r.get('/readings/:id/bill', (req, res) => {
  const b = q.get(`SELECT x.*, m.meter_no, m.connection_size, p.property_no, p.owner_name, p.address, p.property_type, w.name AS ward_name, u.name AS read_by_name
    FROM meter_readings x JOIN water_meters m ON m.id = x.meter_id JOIN properties p ON p.id = m.property_id
    LEFT JOIN wards w ON w.id = p.ward_id LEFT JOIN users u ON u.id = x.read_by WHERE x.id = ?`, req.params.id);
  if (!b) return res.status(404).json({ message: 'बिल सापडले नाही' });
  res.json({ ...b, rows: JSON.parse(b.bill_breakup || '[]') });
});

r.post('/readings/:id/pay', (req, res) => {
  const { payment_mode } = req.body || {};
  if (!['UPI', 'CASH', 'CHEQUE', 'DEBIT_CARD', 'NET_BANKING'].includes(payment_mode)) return res.status(400).json({ message: 'भरण्याची पद्धत निवडा' });
  const b = q.get('SELECT * FROM meter_readings WHERE id = ?', req.params.id);
  if (!b) return res.status(404).json({ message: 'बिल सापडले नाही' });
  if (b.bill_status === 'paid') return res.status(400).json({ message: 'हे बिल आधीच भरलेले आहे' });
  const txn = `MNPW${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  q.run("UPDATE meter_readings SET bill_status = 'paid', paid_at = ?, payment_mode = ?, transaction_id = ?, collected_by = ? WHERE id = ?", now(), payment_mode, txn, req.user.id, b.id);
  res.json({ ok: true, transaction_id: txn });
});

// ---------------- टँकर फेरी — OTP ने डिलिव्हरी ----------------
const newOtp = () => String(crypto.randomInt(1000, 10000));
const TRIP_SELECT = `SELECT t.*, v.reg_no, u.name AS driver_name, u.mobile AS driver_mobile, w.name AS ward_name, c.name AS created_by_name
  FROM tanker_trips t LEFT JOIN vehicles v ON v.id = t.vehicle_id LEFT JOIN users u ON u.id = t.driver_id
  LEFT JOIN wards w ON w.id = t.ward_id LEFT JOIN users c ON c.id = t.created_by`;
const tripView = (t, user) => {
  const o = { ...t, citizen_mobile: user.role === 'worker' ? maskMobile(decrypt(t.citizen_mobile_enc)) : decrypt(t.citizen_mobile_enc) };
  delete o.citizen_mobile_enc; delete o.otp_hash;
  return o;
};

function sendOtp(trip, mobile, otp) {
  if (mobile) {
    sendWhatsApp(mobile, `🚰 *अमरावती महानगरपालिका — पाणी टँकर*\nफेरी ${trip.trip_no}: ${trip.litres_requested.toLocaleString('en-IN')} लिटर — ${trip.location}\nटँकर पोहोचल्यावर चालकाला हा OTP द्या: *${otp}*\n(OTP कोणालाही आधी सांगू नका)`);
  }
}

r.get('/tanker-trips', (req, res) => {
  const params = [];
  let where = '1=1';
  if (req.user.role === 'worker') { where = 't.driver_id = ?'; params.push(req.user.id); }
  else if (req.user.role !== 'admin' && req.user.ward_id) { where = 't.ward_id = ?'; params.push(req.user.ward_id); }
  if (req.query.status) { where += ' AND t.status = ?'; params.push(req.query.status); }
  res.json(q.all(`${TRIP_SELECT} WHERE ${where} ORDER BY t.status = 'scheduled' DESC, t.id DESC LIMIT 200`, ...params).map((t) => tripView(t, req.user)));
});

r.get('/tanker-trips/:id', (req, res) => {
  const t = q.get(`${TRIP_SELECT} WHERE t.id = ?`, req.params.id);
  if (!t) return res.status(404).json({ message: 'फेरी सापडली नाही' });
  if (req.user.role === 'worker' && t.driver_id !== req.user.id) return res.status(403).json({ message: 'ही फेरी तुम्हाला दिलेली नाही' });
  res.json(tripView(t, req.user));
});

r.get('/tanker-drivers', requireRole('clerk', 'officer', 'admin'), (req, res) => {
  const water = q.get("SELECT id FROM departments WHERE code = 'water'").id;
  res.json({
    drivers: q.all("SELECT id, name, designation, ward_id FROM users WHERE role = 'worker' AND active = 1 AND department_id = ? ORDER BY name", water),
    tankers: q.all("SELECT id, reg_no, ward_id, status FROM vehicles WHERE type = 'tanker' ORDER BY reg_no"),
  });
});

r.post('/tanker-trips', requireRole('clerk', 'officer', 'admin'), (req, res, next) => {
  try {
    const { vehicle_id, driver_id, location, lat, lng, citizen_name, citizen_mobile, litres_requested, purpose } = req.body || {};
    if (!location || !(litres_requested > 0) || !driver_id) fail(400, 'ठिकाण, लिटर व टँकर चालक आवश्यक');
    if (citizen_mobile && !/^\d{10}$/.test(citizen_mobile)) fail(400, 'मोबाईल नंबर १० अंकी हवा');
    const driver = q.get("SELECT id FROM users WHERE id = ? AND role = 'worker' AND active = 1", driver_id);
    if (!driver) fail(400, 'टँकर चालक निवडा');
    let wardId = req.user.ward_id || null;
    if (typeof lat === 'number') wardId = findWard(q.all('SELECT * FROM wards'), lat, lng)?.ward.id || wardId;
    const otp = newOtp();
    const tripNo = nextNumber('TNK', 'tanker_trips', 'trip_no');
    const id = Number(q.run(`INSERT INTO tanker_trips (trip_no, vehicle_id, driver_id, ward_id, location, lat, lng, citizen_name, citizen_mobile_enc, purpose, litres_requested,
        otp_hash, otp_expires_at, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    tripNo, vehicle_id || null, driver.id, wardId, location, lat ?? null, lng ?? null, citizen_name, encrypt(citizen_mobile), purpose,
    Math.round(litres_requested), sha256(`${tripNo}:${otp}`), new Date(Date.now() + 48 * 3600e3).toISOString(), req.user.id, now()).lastInsertRowid);
    sendOtp({ trip_no: tripNo, litres_requested: Math.round(litres_requested), location }, citizen_mobile, otp);
    notify(driver.id, `🚰 नवीन टँकर फेरी ${tripNo}`, `${Math.round(litres_requested).toLocaleString('en-IN')} लिटर — ${location}${lat ? `\n📍 https://www.google.com/maps?q=${lat},${lng}` : ''}`, `/tanker/${id}`);
    emit('tanker', { id, action: 'created' });
    // demo / चाचणीसाठी (production मध्ये OTP फक्त नागरिकाला जातो)
    res.status(201).json({ id, trip_no: tripNo, ...(process.env.NODE_ENV !== 'production' && { demo_otp: otp }) });
  } catch (e) { next(e); }
});

r.post('/tanker-trips/:id/resend-otp', requireRole('clerk', 'officer', 'admin'), (req, res) => {
  const t = q.get('SELECT * FROM tanker_trips WHERE id = ?', req.params.id);
  if (!t || t.status !== 'scheduled') return res.status(400).json({ message: 'ही फेरी चालू नाही' });
  const otp = newOtp();
  q.run('UPDATE tanker_trips SET otp_hash = ?, otp_expires_at = ?, otp_attempts = 0 WHERE id = ?', sha256(`${t.trip_no}:${otp}`), new Date(Date.now() + 48 * 3600e3).toISOString(), t.id);
  sendOtp(t, decrypt(t.citizen_mobile_enc), otp);
  res.json({ ok: true, ...(process.env.NODE_ENV !== 'production' && { demo_otp: otp }) });
});

// चालक: पोहोचल्यावर OTP + दिलेले लिटर + GPS
r.post('/tanker-trips/:id/deliver', (req, res, next) => {
  try {
    const t = q.get('SELECT * FROM tanker_trips WHERE id = ?', req.params.id);
    if (!t) fail(404, 'फेरी सापडली नाही');
    if (t.driver_id !== req.user.id && req.user.role !== 'admin') fail(403, 'ही फेरी तुम्हाला दिलेली नाही');
    if (t.status !== 'scheduled') fail(400, 'या फेरीची नोंद आधीच झाली आहे');
    if (t.otp_attempts >= 5) fail(429, 'खूप चुकीचे OTP — अधिकाऱ्याकडून नवीन OTP पाठवा');
    if (Date.parse(t.otp_expires_at) < Date.now()) fail(400, 'OTP कालबाह्य झाला — नवीन OTP मागवा');
    const { otp, litres_delivered, lat, lng } = req.body || {};
    if (sha256(`${t.trip_no}:${String(otp || '').trim()}`) !== t.otp_hash) {
      q.run('UPDATE tanker_trips SET otp_attempts = otp_attempts + 1 WHERE id = ?', t.id);
      fail(400, 'OTP चुकीचा आहे — नागरिकाकडून पुन्हा विचारा');
    }
    const litres = Math.round(Number(litres_delivered));
    if (!(litres > 0) || litres > 30000) fail(400, 'दिलेले लिटर योग्य टाका');
    const dist = typeof lat === 'number' && t.lat ? distanceMeters(lat, lng, t.lat, t.lng) : null;
    q.run(`UPDATE tanker_trips SET status = 'delivered', litres_delivered = ?, delivered_at = ?, delivered_lat = ?, delivered_lng = ?, delivery_distance_m = ? WHERE id = ?`,
      litres, now(), lat ?? null, lng ?? null, dist, t.id);
    notify(t.created_by, `✅ टँकर पोहोचला: ${t.trip_no}`, `${litres.toLocaleString('en-IN')} लिटर — ${t.location}${dist != null && dist > 500 ? ` ⚠️ ठिकाणापासून ${dist} मी. दूर` : ''}`, '/tanker');
    emit('tanker', { id: t.id, action: 'delivered' });
    res.json({ ok: true, distance_m: dist });
  } catch (e) { next(e); }
});

r.post('/tanker-trips/:id/cancel', requireRole('clerk', 'officer', 'admin'), (req, res) => {
  q.run("UPDATE tanker_trips SET status = 'cancelled' WHERE id = ? AND status = 'scheduled'", req.params.id);
  res.json({ ok: true });
});

// आजचा सारांश (डॅशबोर्डसाठी)
export function waterSummary(wardId) {
  const w = wardId ? ' AND p.ward_id = ?' : '';
  const p0 = wardId ? [wardId] : [];
  const d0 = new Date(`${today()}T00:00:00+05:30`).toISOString();
  return {
    readings_today: q.get(`SELECT COUNT(*) AS c FROM meter_readings x JOIN water_meters m ON m.id = x.meter_id JOIN properties p ON p.id = m.property_id WHERE x.read_at >= ?${w}`, d0, ...p0).c,
    tanker_today: q.get(`SELECT COUNT(*) AS c, COALESCE(SUM(litres_delivered),0) AS litres FROM tanker_trips WHERE status = 'delivered' AND delivered_at >= ?${wardId ? ' AND ward_id = ?' : ''}`, d0, ...p0),
  };
}

export default r;
