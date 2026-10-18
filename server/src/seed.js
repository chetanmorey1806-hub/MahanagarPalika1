// Demo डेटा. `npm run seed` केल्यास संपूर्ण DB पुसून नवीन demo डेटा भरला जातो.
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { db, q, tx } from './db.js';
import { encrypt, sha256 } from './utils/crypto.js';
import { approverFor } from './utils/hierarchy.js';

// अमरावती महानगरपालिकेचे ४३ प्रभाग (२०१२ प्रभाग रचना — स्रोत: Wikipedia "Amravati Municipal Corporation").
// केंद्रबिंदू अंदाजे आहेत — अधिकृत GIS हद्द मिळाल्यावर Admin → वॉर्ड Geo-fence मध्ये भरा.
const WARDS = [
  ['प्रभाग १ - शेगाव', 20.956, 77.776],
  ['प्रभाग २ - तपोवन', 20.961, 77.79],
  ['प्रभाग ३ - जवाहर स्टेडियम', 20.9385, 77.7555],
  ['प्रभाग ४ - संत गाडगेबाबा', 20.952, 77.765],
  ['प्रभाग ५ - रामपुरी कॅम्प', 20.943, 77.762],
  ['प्रभाग ६ - विदर्भ महाविद्यालय', 20.9465, 77.7525],
  ['प्रभाग ७ - नवसारी', 20.9625, 77.745],
  ['प्रभाग ८ - जमील कॉलनी', 20.9455, 77.735],
  ['प्रभाग ९ - महेंद्र कॉलनी', 20.95, 77.742],
  ['प्रभाग १० - विलास नगर', 20.9365, 77.77],
  ['प्रभाग ११ - मोरबाग', 20.9255, 77.74],
  ['प्रभाग १२ - अंबापेठ', 20.932, 77.758],
  ['प्रभाग १३ - मालटेकडी', 20.9375, 77.745],
  ['प्रभाग १४ - एसआरपीएफ', 20.92, 77.79],
  ['प्रभाग १५ - वडाळी', 20.935, 77.795],
  ['प्रभाग १६ - चपराशीपुरा बिच्छूटेकडी', 20.928, 77.765],
  ['प्रभाग १७ - काँग्रेसनगर फ्रेजरपुरा', 20.93, 77.78],
  ['प्रभाग १८ - रुक्मिणी नगर', 20.94, 77.775],
  ['प्रभाग १९ - स्वामी विवेकानंद', 20.922, 77.76],
  ['प्रभाग २० - अंबिका नगर', 20.918, 77.77],
  ['प्रभाग २१ - राजापेठ', 20.925, 77.755],
  ['प्रभाग २२ - शारदा नगर', 20.915, 77.762],
  ['प्रभाग २३ - गोरक्षण', 20.92, 77.748],
  ['प्रभाग २४ - बुधवारा', 20.932, 77.745],
  ['प्रभाग २५ - जवाहर गेट', 20.93, 77.749],
  ['प्रभाग २६ - गवळीपुरा', 20.935, 77.74],
  ['प्रभाग २७ - पठाणपुरा', 20.938, 77.735],
  ['प्रभाग २८ - मेहदिया कॉलनी', 20.942, 77.728],
  ['प्रभाग २९ - अलीम नगर', 20.948, 77.728],
  ['प्रभाग ३० - रहमत नगर', 20.952, 77.735],
  ['प्रभाग ३१ - गडगेश्वर', 20.927, 77.735],
  ['प्रभाग ३२ - नवाथे प्लॉट', 20.922, 77.74],
  ['प्रभाग ३३ - दस्तूर नगर', 20.915, 77.775],
  ['प्रभाग ३४ - किरण नगर', 20.91, 77.768],
  ['प्रभाग ३५ - वडरपुरा', 20.92, 77.73],
  ['प्रभाग ३६ - बेनोडा भीमटेकडी', 20.905, 77.78],
  ['प्रभाग ३७ - जेवड नगर', 20.912, 77.755],
  ['प्रभाग ३८ - अकोली साईनगर', 20.9, 77.77],
  ['प्रभाग ३९ - नेमाणी गोडाऊन', 20.895, 77.755],
  ['प्रभाग ४० - अल्मास नगर', 20.885, 77.745],
  ['प्रभाग ४१ - बारीपुरा', 20.865, 77.735],
  ['प्रभाग ४२ - सोमवार बाजार', 20.86, 77.728],
  ['प्रभाग ४३ - झिरी', 20.855, 77.74]
];
// Demo कर्मचारी, वाहने व कामे या ८ "पायलट" प्रभागांत (बाकी प्रभागांतील तक्रारी विभाग प्रमुखांकडे जातात)
const PILOT = [25, 21, 5, 4, 15, 33, 38, 41];

const DEPTS = [
  ['sanitation', 'घनकचरा व्यवस्थापन', '🚛'],
  ['water', 'पाणीपुरवठा विभाग', '🚰'],
  ['roads', 'रस्ते व बांधकाम', '🛣️'],
  ['electrical', 'विद्युत विभाग', '💡'],
  ['health', 'आरोग्य विभाग', '🏥'],
  ['drainage', 'मलनिःसारण विभाग', '🕳️'],
  ['tax', 'कर आकारणी व संकलन', '💰'],
  ['planning', 'नगररचना विभाग', '🏗️'],
];

const CATEGORIES = [
  ['garbage', 'कचरा उचलला नाही', '🗑️', 'sanitation', 12],
  ['dead_animal', 'मृत जनावर', '🐕', 'sanitation', 6],
  ['water_leak', 'पाणी गळती', '💧', 'water', 12],
  ['no_water', 'पाणी पुरवठा नाही', '🚱', 'water', 24],
  ['pothole', 'रस्त्यावरील खड्डा', '🕳️', 'roads', 24],
  ['streetlight', 'पथदिवा बंद', '💡', 'electrical', 48],
  ['drainage', 'ड्रेनेज तुंबले', '🚽', 'drainage', 12],
  ['mosquito', 'डास / फवारणी', '🦟', 'health', 48],
];

const hash = (p) => bcrypt.hashSync(p, 8);
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function seed() {
  tx(() => {
    WARDS.forEach((w, i) => q.run('INSERT INTO wards (ward_number, name, lat, lng, radius_m) VALUES (?,?,?,?,?)', i + 1, ...w, PILOT.includes(i + 1) ? 1400 : 900));
    for (const d of DEPTS) q.run('INSERT INTO departments (code, name, icon) VALUES (?,?,?)', ...d);
    const dept = Object.fromEntries(q.all('SELECT id, code FROM departments').map((d) => [d.code, d.id]));
    for (const [code, name, icon, d, sla] of CATEGORIES) q.run('INSERT INTO categories (code, name, icon, department_id, sla_hours) VALUES (?,?,?,?,?)', code, name, icon, dept[d], sla);

    const addUser = (name, mobile, pass, role, designation, ward, deptCode) =>
      Number(q.run('INSERT INTO users (name, mobile, password_hash, role, designation, ward_id, department_id) VALUES (?,?,?,?,?,?,?)',
        name, mobile, hash(pass), role, designation, ward, deptCode ? dept[deptCode] : null).lastInsertRowid);

    // Admin / आयुक्त
    const adminId = addUser('श्री. राजेश पाटील', '9000000001', 'admin123', 'admin', 'महापालिका आयुक्त', null, null);
    q.run('UPDATE users SET email = ? WHERE id = ?', 'commissioner@mnp.example.in', adminId);
    // विभाग प्रमुख (सर्व वॉर्ड)
    addUser('सौ. सुनीता देशमुख', '9000000002', 'officer123', 'officer', 'घनकचरा विभाग प्रमुख', null, 'sanitation');
    addUser('श्री. अनिल जोशी', '9000000003', 'officer123', 'officer', 'कार्यकारी अभियंता (पाणी)', null, 'water');
    addUser('डॉ. मीना कुलकर्णी', '9000000004', 'officer123', 'officer', 'वैद्यकीय आरोग्य अधिकारी', null, 'health');
    addUser('श्री. विजय शिंदे', '9000000005', 'officer123', 'officer', 'नगररचनाकार', null, 'planning');
    addUser('श्री. प्रकाश माने', '9000000006', 'officer123', 'officer', 'कर अधीक्षक', null, 'tax');
    addUser('श्री. संजय गायकवाड', '9000000007', 'officer123', 'officer', 'कार्यकारी अभियंता (रस्ते)', null, 'roads');

    const firstNames = ['रमेश', 'सुरेश', 'गणेश', 'महेश', 'संतोष', 'दत्ता', 'प्रवीण', 'विठ्ठल', 'शंकर', 'नितीन', 'लता', 'सविता', 'कविता', 'मंगला', 'अर्चना', 'प्रतिभा'];
    const lastNames = ['देशमुख', 'ठाकरे', 'वानखडे', 'गावंडे', 'राऊत', 'इंगोले', 'तायडे', 'गुल्हाने', 'खडसे', 'मेश्राम', 'शेंडे', 'कडू', 'बेलसरे', 'भोयर', 'चौधरी', 'पवार'];
    let mobileSeq = 9100000000;
    let workerShown = false;
    for (const [pi, w] of PILOT.entries()) {
      // प्रत्येक पायलट प्रभागाला सफाई व पाणी विभागाचे प्रभाग अधिकारी
      addUser(`${pick(firstNames)} ${pick(lastNames)}`, String(9200000000 + (pi + 1) * 10 + 1), 'officer123', 'officer', 'स्वच्छता निरीक्षक', w, 'sanitation');
      addUser(`${pick(firstNames)} ${pick(lastNames)}`, String(9200000000 + (pi + 1) * 10 + 2), 'officer123', 'officer', 'कनिष्ठ अभियंता (पाणी)', w, 'water');
      for (const [d, desig, n] of [['sanitation', 'सफाई कामगार', 3], ['water', 'पाणी पुरवठा कर्मचारी', 2], ['roads', 'मेंटेनन्स कर्मचारी', 1],
        ['electrical', 'वायरमन', 1], ['drainage', 'ड्रेनेज कर्मचारी', 1], ['health', 'फवारणी कर्मचारी', 1]]) {
        for (let i = 0; i < n; i++) {
          const mobile = !workerShown ? '9100000001' : String(++mobileSeq + 1);
          workerShown = true;
          addUser(`${pick(firstNames)} ${pick(lastNames)}`, mobile, 'worker123', 'worker', desig, w, d);
        }
      }
    }

    // नमुना तक्रारी
    const cats = q.all('SELECT * FROM categories');
    const wards = q.all('SELECT * FROM wards').filter((x) => PILOT.includes(x.id));
    const streets = ['राजकमल चौकाजवळ', 'इर्विन चौक', 'जयस्तंभ चौक', 'पंचवटी चौक', 'अंबादेवी मंदिराजवळ', 'एकवीरा देवी मंदिराजवळ', 'बस स्टँडजवळ',
      'रेल्वे स्टेशन रोड', 'भाजी बाजार', 'मोर्शी रोड', 'वलगाव रोड', 'चांदूर रेल्वे रोड', 'शाळेसमोर', 'गल्ली क्र. ३', 'उद्यानाजवळ'];
    const statuses = ['closed', 'closed', 'resolved', 'in_progress', 'assigned', 'assigned', 'new'];
    for (let i = 1; i <= 140; i++) {
      const c = pick(cats);
      const w = pick(wards);
      const createdH = rnd(1, 13 * 24);
      const status = createdH > 72 ? pick(['closed', 'closed', 'closed', 'resolved', 'assigned']) : pick(statuses);
      const worker = q.get("SELECT id FROM users WHERE role='worker' AND ward_id=? AND department_id=? ORDER BY RANDOM() LIMIT 1", w.id, c.department_id);
      const officer = q.get("SELECT id FROM users WHERE role='officer' AND department_id=? AND (ward_id=? OR ward_id IS NULL) ORDER BY ward_id IS NULL LIMIT 1", c.department_id, w.id)
        || { id: 1 };
      const created = ago(createdH);
      const due = new Date(Date.parse(created) + c.sla_hours * 3600e3).toISOString();
      const done = ['resolved', 'closed'].includes(status);
      const resolved = done ? new Date(Date.parse(created) + rnd(0.2, 1.4) * c.sla_hours * 3600e3).toISOString() : null;
      const ticket = `GRV-${new Date().getFullYear()}-${String(i).padStart(5, '0')}`;
      const gid = Number(q.run(`INSERT INTO grievances (ticket_no, category_id, department_id, ward_id, description, citizen_name, citizen_mobile_enc,
          lat, lng, address, source, status, officer_id, assigned_to, sla_due_at, created_at, resolved_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ticket, c.id, c.department_id, w.id, `${c.name} — कृपया लवकर कारवाई करा`, `${pick(firstNames)} ${pick(lastNames)}`,
        encrypt(String(9800000000 + i)), w.lat + rnd(-0.01, 0.01), w.lng + rnd(-0.01, 0.01), `${pick(streets)}, ${w.name.split(' - ')[1]}`,
        pick(['citizen', 'citizen', 'whatsapp', 'helpline', 'staff']), status === 'new' || !worker ? 'new' : status, officer.id,
        status === 'new' || !worker ? null : worker.id, due, created, resolved > new Date().toISOString() ? null : resolved).lastInsertRowid);
      q.run('INSERT INTO grievance_logs (grievance_id, action, note, created_at) VALUES (?,?,?,?)', gid, 'created', 'demo डेटा', created);
      if (done && Math.random() < 0.6) q.run('UPDATE grievances SET citizen_rating = ? WHERE id = ?', pick([3, 4, 4, 5, 5, 5, 2]), gid);
      if (done && Math.random() < 0.1) q.run('UPDATE grievances SET reopen_count = 1 WHERE id = ?', gid);
    }

    // अर्ज
    const types = [['birth', 'BRT', 'health'], ['death', 'DTH', 'health'], ['building', 'BLD', 'planning'], ['trade', 'TRD', 'tax'], ['water', 'WTR', 'water']];
    for (let i = 1; i <= 25; i++) {
      const [type, prefix, d] = pick(types);
      const details = type === 'birth' ? { child_name: `बाळ ${pick(lastNames)}`, dob: '2026-09-' + String(1 + (i % 28)).padStart(2, '0'), hospital: pick(['डफरीन स्त्री रुग्णालय, अमरावती', 'इर्विन जिल्हा रुग्णालय, अमरावती']) }
        : type === 'death' ? { deceased_name: `${pick(firstNames)} ${pick(lastNames)}`, date_of_death: '2026-10-0' + (1 + (i % 9)) }
          : type === 'building' ? { survey_no: `स.नं. ${100 + i}`, area_sqft: 1200 + i * 50, floors: 1 + (i % 4) }
            : type === 'trade' ? { shop_name: `${pick(lastNames)} किराणा`, business: 'किराणा दुकान' }
              : { property_no: `PR-${2000 + i}`, connection_size: '½ इंच' };
      q.run(`INSERT INTO applications (app_no, type, applicant_name, applicant_mobile_enc, details, ward_id, department_id, created_at)
        VALUES (?,?,?,?,?,?,?,?)`, `${prefix}-${new Date().getFullYear()}-${String(i).padStart(5, '0')}`, type,
        `${pick(firstNames)} ${pick(lastNames)}`, encrypt(String(9700000000 + i)), JSON.stringify(details), pick(wards).id, dept[d], ago(rnd(1, 120)));
    }

    // ई-ऑफिस फाईल्स
    const officers = q.all("SELECT id FROM users WHERE role IN ('officer','admin') AND ward_id IS NULL");
    const subjects = ['पावसाळापूर्व नालेसफाई निविदा', 'नवीन पाण्याची टाकी बांधकाम प्रस्ताव', 'कंत्राटी सफाई कामगार वेतन', 'रस्ता रुंदीकरण भूसंपादन',
      'LED पथदिवे खरेदी', 'उद्यान देखभाल करार', 'मालमत्ता कर सवलत प्रस्ताव', 'डेंग्यू प्रतिबंधक मोहीम निधी'];
    subjects.forEach((s, i) => {
      const from = pick(officers).id;
      const to = pick(officers).id;
      const created = ago(rnd(48, 400));
      const received = ago(rnd(2, 300));
      const fid = Number(q.run(`INSERT INTO efiles (file_no, subject, department_id, priority, created_by, current_holder, received_at, created_at)
        VALUES (?,?,?,?,?,?,?,?)`, `FILE-${new Date().getFullYear()}-${String(i + 1).padStart(5, '0')}`, s, dept[pick(Object.keys(dept))],
        i % 3 === 0 ? 'urgent' : 'normal', from, to, received, created).lastInsertRowid);
      q.run('INSERT INTO efile_movements (file_id, from_user, to_user, action, remark, moved_at) VALUES (?,?,?,?,?,?)', fid, null, from, 'created', 'फाईल तयार केली', created);
      q.run('INSERT INTO efile_movements (file_id, from_user, to_user, action, remark, moved_at) VALUES (?,?,?,?,?,?)', fid, from, to, 'forwarded', 'पुढील कार्यवाहीसाठी', received);
    });

    // वाहने + GPS + इंधन + कचरा फेऱ्या
    const vtypes = [['garbage', 'MH27-GC'], ['garbage', 'MH27-GC'], ['tanker', 'MH27-WT'], ['jcb', 'MH27-JC']];
    let vno = 1001;
    for (const w of wards) {
      for (const [type, prefix] of vtypes) {
        const lat = w.lat + rnd(-0.008, 0.008);
        const lng = w.lng + rnd(-0.008, 0.008);
        const speed = Math.random() > 0.4 ? rnd(8, 35) : 0;
        const vid = Number(q.run(`INSERT INTO vehicles (reg_no, type, ward_id, driver_name, driver_mobile, status, last_lat, last_lng, last_speed, last_seen, device_key)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`, `${prefix}-${vno++}`, type, w.id, `${pick(firstNames)} ${pick(lastNames)}`, String(9300000000 + vno),
          Math.random() > 0.9 ? 'maintenance' : speed > 2 ? 'running' : 'idle', lat, lng, speed, ago(rnd(0, 0.3)), crypto.randomBytes(16).toString('hex')).lastInsertRowid);
        let plat = lat; let plng = lng;
        for (let k = 20; k >= 0; k--) {
          plat += rnd(-0.0015, 0.0015); plng += rnd(-0.0015, 0.0015);
          q.run('INSERT INTO vehicle_pings (vehicle_id, lat, lng, speed, at) VALUES (?,?,?,?,?)', vid, plat, plng, rnd(0, 30), ago(k * 0.25));
        }
        for (let k = 0; k < 6; k++) q.run('INSERT INTO fuel_logs (vehicle_id, litres, amount, odometer_km, logged_by, logged_at) VALUES (?,?,?,?,?,?)', vid, rnd(20, 60), rnd(2000, 6000), 10000 + k * 150, 1, ago(rnd(1, 29 * 24)));
        if (type === 'garbage') for (let d = 0; d < 18; d++) q.run('INSERT INTO waste_trips (vehicle_id, ward_id, tonnes, at) VALUES (?,?,?,?)', vid, w.id, rnd(2, 6), ago(d * 12 + rnd(0, 6)));
      }
    }

    // मालमत्ता, कर आकारणी व भरणा
    const RATE = { RESIDENTIAL: 2.5, COMMERCIAL: 6, INDUSTRIAL: 4, MIXED: 4 };
    const fyNow = (() => { const d = new Date(); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return y; })();
    const modes = ['UPI', 'UPI', 'UPI', 'CASH', 'NET_BANKING', 'DEBIT_CARD', 'CHEQUE'];
    let txnSeq = 1;
    for (let i = 1; i <= 300; i++) {
      const w = pick(wards);
      const type = pick(['RESIDENTIAL', 'RESIDENTIAL', 'RESIDENTIAL', 'COMMERCIAL', 'MIXED', 'INDUSTRIAL']);
      const area = Math.round(rnd(400, type === 'INDUSTRIAL' ? 8000 : 2500));
      const created = ago(rnd(400, 3000) * 24);
      const pid = Number(q.run(`INSERT INTO properties (property_no, owner_name, owner_mobile_enc, ward_id, address, built_up_area_sqft, property_type, lat, lng, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, `PR-${String(w.id).padStart(2, '0')}-${String(i).padStart(5, '0')}`, `${pick(firstNames)} ${pick(lastNames)}`,
        encrypt(String(9600000000 + i)), w.id, `${pick(streets)}, ${w.name.split(' - ')[1]}`, area, type,
        w.lat + rnd(-0.01, 0.01), w.lng + rnd(-0.01, 0.01), created, created).lastInsertRowid);
      for (const y of [fyNow - 1, fyNow]) {
        const fy = `${y}-${y + 1}`;
        const tax = Math.round(area * RATE[type] * 100) / 100;
        const r0 = Math.random();
        // मागील वर्ष: बहुतेक भरलेले; चालू वर्ष: अर्धे भरलेले
        const status = y < fyNow ? (r0 < 0.85 ? 'PAID' : r0 < 0.93 ? 'PARTIAL' : 'PENDING') : (r0 < 0.45 ? 'PAID' : r0 < 0.55 ? 'PARTIAL' : 'PENDING');
        const discount = status === 'PAID' && Math.random() < 0.5 ? Math.round(tax * 5) / 100 : 0;
        const paid = status === 'PAID' ? tax - discount : status === 'PARTIAL' ? Math.round(tax * rnd(0.3, 0.7)) : 0;
        const at = new Date().toISOString();
        const aid = Number(q.run(`INSERT INTO tax_assessments (property_id, financial_year, tax_amount, discount_amount, total_payable, amount_paid, payment_status, created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?)`, pid, fy, tax, discount, tax - discount, paid, status, at, at).lastInsertRowid);
        if (paid > 0) {
          // चालू वर्षाचे भरणे गेल्या ४५ दिवसांत, मागील वर्षाचे त्या वर्षात
          const paidAt = y < fyNow ? new Date(Date.parse(`${y}-06-15T10:00:00Z`) + rnd(0, 200) * 864e5).toISOString() : ago(rnd(0, 45 * 24));
          q.run(`INSERT INTO payments (transaction_id, assessment_id, ward_id, amount_paid, payment_mode, payment_gateway_response, payment_status, collected_by, paid_at)
            VALUES (?,?,?,?,?,?,?,?,?)`, `MNPDEMO${String(txnSeq++).padStart(6, '0')}`, aid, w.id, paid, pick(modes), '{"channel":"demo"}', 'SUCCESS', 1, paidAt);
        }
      }
    }

    // कचरा गाड्यांचे ठरलेले मार्ग (Designated Routes) + checkpoints (गल्ल्या)
    const gallis = ['अंबादेवी मंदिर रस्ता', 'जवाहर रोड', 'गांधी चौक', 'मालवीय चौक', 'इतवारा बाजार', 'सराफा बाजार', 'चित्रा चौक', 'नेहरू मैदान'];
    for (const v of q.all("SELECT * FROM vehicles WHERE type = 'garbage'")) {
      const pts = [];
      let lat = v.last_lat; let lng = v.last_lng;
      for (let k = 0; k < 7; k++) { pts.push([lng, lat]); lat += rnd(-0.003, 0.003); lng += rnd(0.0015, 0.004); }
      const rid = Number(q.run(`INSERT INTO vehicle_routes (vehicle_id, name, path, tolerance_m, shift_start, shift_end, created_at) VALUES (?,?,?,?,?,?,?)`,
        v.id, `${v.reg_no} — दैनंदिन फेरी`, JSON.stringify(pts), 150, '06:00', '22:00', new Date().toISOString()).lastInsertRowid);
      [1, 3, 5, 6].forEach((k, n) => q.run('INSERT INTO route_checkpoints (route_id, name, lat, lng, radius_m) VALUES (?,?,?,?,?)', rid, gallis[(v.id + n) % gallis.length], pts[k][1], pts[k][0], 60));
      // गाडीने आज मार्गावर फिरल्याचे pings (शेवटचे checkpoint काही गाड्यांनी चुकवलेले)
      const skipLast = v.id % 3 === 0;
      const steps = skipLast ? 5 : 6;
      for (let k = 0; k <= steps * 4; k++) {
        const seg = Math.min(steps - 1, Math.floor(k / 4)); const t = k === steps * 4 ? 1 : (k % 4) / 4;
        const a = pts[seg]; const b = pts[seg + 1];
        q.run('INSERT INTO vehicle_pings (vehicle_id, lat, lng, speed, at) VALUES (?,?,?,?,?)', v.id, a[1] + (b[1] - a[1]) * t, a[0] + (b[0] - a[0]) * t, rnd(8, 25),
          new Date(Date.parse(`${new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)}T06:30:00+05:30`) + k * 8 * 60e3).toISOString());
      }
      if (skipLast) {
        q.run('INSERT INTO vehicle_alerts (vehicle_id, type, message, lat, lng, created_at) VALUES (?,?,?,?,?,?)', v.id, 'missed_checkpoint',
          `${v.reg_no} काल ${gallis[(v.id + 3) % gallis.length]} येथे गेली नाही`, pts[6][1], pts[6][0], ago(rnd(14, 20)));
      }
      if (v.id % 4 === 1) {
        q.run('INSERT INTO vehicle_alerts (vehicle_id, type, message, lat, lng, created_at) VALUES (?,?,?,?,?,?)', v.id, 'off_route',
          `${v.reg_no} ठरलेल्या मार्गावरून 420 मी. बाहेर गेली होती — चालक: ${v.driver_name}`, v.last_lat + 0.004, v.last_lng, ago(rnd(1, 5)));
      }
    }

    // कर्मचाऱ्यांचे काम-रिपोर्ट (voice)
    const reportTexts = ['वॉर्ड मध्ये मुख्य रस्ता साफ झाला आहे', 'बाजार पेठेतील कचरा उचलला, दोन गाड्या भरल्या', 'शाळेसमोरील गटार साफ केले', 'मंदिराजवळ पाण्याची गळती दुरुस्त केली', 'उद्यानातील कचराकुंडी रिकामी केली'];
    for (const u of q.all("SELECT id, ward_id FROM users WHERE role = 'worker' ORDER BY RANDOM() LIMIT 15")) {
      q.run('INSERT INTO work_reports (user_id, ward_id, text, via_voice, created_at) VALUES (?,?,?,?,?)', u.id, u.ward_id, pick(reportTexts), 1, ago(rnd(0, 8)));
    }

    // ---- लिपिक (कार्यालयीन कर्मचारी): प्रत्येक प्रभाग कार्यालयात कर/अर्ज काउंटर ----
    for (const [pi, w] of PILOT.entries()) {
      addUser(`${pick(firstNames)} ${pick(lastNames)}`, String(9400000000 + (pi + 1) * 10 + 1), 'clerk123', 'clerk', 'कर लिपिक', w, 'tax');
      addUser(`${pick(firstNames)} ${pick(lastNames)}`, String(9400000000 + (pi + 1) * 10 + 2), 'clerk123', 'clerk', 'जन्म-मृत्यू नोंदणी लिपिक', w, 'health');
    }
    // ई-ऑफिस फाईलसाठी मुख्यालयातील लिपिक
    addUser('श्री. नितीन देसाई', '9400000001', 'clerk123', 'clerk', 'वरिष्ठ लिपिक (सामान्य प्रशासन)', null, 'planning');

    // ---- कर्मचारी कोड, मूळ वेतन, रुजू दिनांक ----
    const PAY = { admin: 125000, officer: 68000, clerk: 32000, worker: 21000 };
    for (const u of q.all('SELECT id, role, ward_id FROM users')) {
      const pay = u.role === 'officer' && !u.ward_id ? 85000 : PAY[u.role];
      q.run('UPDATE users SET employee_code = ?, basic_pay = ?, joining_date = ? WHERE id = ?',
        `MNP-${String(u.id).padStart(4, '0')}`, Math.round(pay * rnd(0.92, 1.1) / 100) * 100, `${2005 + Math.floor(rnd(0, 18))}-0${1 + Math.floor(rnd(0, 9))}-01`, u.id);
    }

    // ---- सार्वजनिक सुट्ट्या (महाराष्ट्र) ----
    const Y = new Date().getFullYear();
    for (const [d, n] of [['01-26', 'प्रजासत्ताक दिन'], ['02-19', 'छत्रपती शिवाजी महाराज जयंती'], ['03-19', 'गुढीपाडवा'], ['04-14', 'डॉ. बाबासाहेब आंबेडकर जयंती'],
      ['05-01', 'महाराष्ट्र दिन'], ['08-15', 'स्वातंत्र्य दिन'], ['09-14', 'गणेश चतुर्थी'], ['10-02', 'गांधी जयंती'], ['10-20', 'दसरा'], ['11-08', 'दिवाळी (लक्ष्मीपूजन)'], ['12-25', 'नाताळ']]) {
      q.run('INSERT OR REPLACE INTO holidays (date, name) VALUES (?,?)', `${Y}-${d}`, n);
    }

    // ---- मागील दिवसांची हजेरी (आजची नाही — demo मध्ये तुम्ही स्वतः हजेरी देऊन पहा) ----
    const holidays = new Set(q.all('SELECT date FROM holidays').map((h) => h.date));
    const staff = q.all("SELECT u.id, u.ward_id, w.lat, w.lng FROM users u LEFT JOIN wards w ON w.id = u.ward_id WHERE u.role IN ('worker','clerk')");
    for (let back = 45; back >= 1; back--) {
      const d = new Date(Date.now() + 5.5 * 3600e3 - back * 864e5);
      const date = d.toISOString().slice(0, 10);
      if (d.getUTCDay() === 0 || holidays.has(date)) continue;
      for (const u of staff) {
        if (Math.random() < 0.08) continue; // गैरहजर
        const inAt = new Date(`${date}T0${6 + Math.floor(rnd(0, 3))}:${String(Math.floor(rnd(0, 59))).padStart(2, '0')}:00+05:30`);
        const outAt = new Date(inAt.getTime() + rnd(7.5, 9) * 3600e3);
        const lat = (u.lat || 20.93) + rnd(-0.005, 0.005);
        const lng = (u.lng || 77.75) + rnd(-0.005, 0.005);
        const inside = Math.random() > 0.04;
        q.run(`INSERT OR IGNORE INTO attendance (user_id, date, check_in_at, check_in_lat, check_in_lng, check_in_distance_m, check_out_at, check_out_lat, check_out_lng, inside_geofence)
          VALUES (?,?,?,?,?,?,?,?,?,?)`, u.id, date, inAt.toISOString(), lat, lng, inside ? Math.round(rnd(50, 900)) : Math.round(rnd(2700, 4000)),
          outAt.toISOString(), lat, lng, inside ? 1 : 0);
      }
    }

    // ---- रजा अर्ज ----
    const istDay = (offset) => new Date(Date.now() + 5.5 * 3600e3 + offset * 864e5).toISOString().slice(0, 10);
    const leaveStaff = q.all("SELECT * FROM users WHERE role IN ('worker','clerk') ORDER BY RANDOM() LIMIT 14");
    const reasons = ['घरगुती कार्यक्रम', 'ताप आल्यामुळे', 'गावी जायचे आहे', 'मुलाची शाळेची मीटिंग', 'लग्न समारंभ', 'डॉक्टरांची भेट'];
    leaveStaff.forEach((u, i) => {
      const type = pick(['casual', 'casual', 'sick', 'earned']);
      const start = i < 6 ? istDay(Math.floor(rnd(1, 10))) : istDay(-Math.floor(rnd(2, 20)));
      const len = Math.floor(rnd(0, 3));
      const end = new Date(Date.parse(`${start}T00:00:00Z`) + len * 864e5).toISOString().slice(0, 10);
      const approver = approverFor(u);
      const status = i < 6 ? 'pending' : pick(['approved', 'approved', 'approved', 'rejected']);
      q.run(`INSERT INTO leave_requests (user_id, leave_type, from_date, to_date, days, reason, status, approver_id, decided_by, remark, created_at, decided_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, u.id, type, start, end, len + 1, pick(reasons), status, approver, status === 'pending' ? null : approver,
        status === 'rejected' ? 'कामाचा ताण जास्त आहे, नंतर घ्या' : null, ago(rnd(24, 200)), status === 'pending' ? null : ago(rnd(1, 20)));
    });
    // आज रजेवर असलेला एक कर्मचारी
    const onLeave = q.get("SELECT * FROM users WHERE role = 'worker' AND mobile <> '9100000001' ORDER BY id DESC LIMIT 1");
    q.run(`INSERT INTO leave_requests (user_id, leave_type, from_date, to_date, days, reason, status, approver_id, decided_by, created_at, decided_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, onLeave.id, 'sick', istDay(-1), istDay(1), 3, 'ताप', 'approved', approverFor(onLeave), approverFor(onLeave), ago(30), ago(26));

    // ---- परिपत्रके ----
    const notices = [
      [adminId, 'पावसाळापूर्व नालेसफाई मोहीम', 'सर्व प्रभागांनी ३१ मे पूर्वी नालेसफाईचे काम पूर्ण करावे. दररोज Before/After फोटो अ‍ॅपमध्ये अपलोड करणे बंधनकारक आहे.', 'urgent', null, null],
      [adminId, 'हजेरी फक्त मोबाईल अ‍ॅपवरूनच', '१ तारखेपासून बायोमेट्रिक मशीन बंद. सर्व कर्मचाऱ्यांनी नेमून दिलेल्या प्रभागातूनच सेल्फी हजेरी द्यावी.', 'normal', null, null],
      [2, 'सफाई कर्मचाऱ्यांसाठी नवीन गणवेश वाटप', 'प्रभाग कार्यालयातून गणवेश घेण्यासाठी अ‍ॅपमधून "साहित्य मागणी" करा.', 'normal', 'worker', 'sanitation'],
    ];
    for (const [by, t, b, pr, role, dept] of notices) {
      q.run('INSERT INTO notices (title, body, priority, audience_role, department_id, created_by, created_at) VALUES (?,?,?,?,?,?,?)',
        t, b, pr, role, dept ? q.get('SELECT id FROM departments WHERE code = ?', dept).id : null, by, ago(rnd(5, 72)));
    }

    // ---- कामाचे आदेश ----
    const woTitles = [['नालेसफाई मोहीम', 'मुख्य नाला, बाजार पेठ मागे'], ['डेंग्यू सर्वेक्षण — घरोघरी', 'गल्ली क्र. ३ ते ७'], ['सार्वजनिक शौचालय स्वच्छता', 'बस स्टॉपजवळील शौचालय'],
      ['रस्ता दुभाजक रंगकाम', 'स्टेशन रोड'], ['कचराकुंडी मुक्त परिसर', 'शाळेसमोरील चौक']];
    for (const o of q.all("SELECT id, ward_id, department_id FROM users WHERE role = 'officer' AND ward_id IS NOT NULL")) {
      const workers = q.all("SELECT id FROM users WHERE role = 'worker' AND ward_id = ? AND department_id = ? LIMIT 2", o.ward_id, o.department_id);
      workers.forEach((w, k) => {
        const [title, loc] = pick(woTitles);
        const status = k === 0 ? 'assigned' : pick(['in_progress', 'done', 'verified']);
        q.run(`INSERT INTO work_orders (order_no, title, description, location, assigned_to, assigned_by, ward_id, department_id, due_date, status, created_at, started_at, completed_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, `WO-${Y}-${String(q.get('SELECT COUNT(*) AS c FROM work_orders').c + 1).padStart(5, '0')}`, title,
          'काम पूर्ण झाल्यावर Before/After फोटो अपलोड करा', loc, w.id, o.id, o.ward_id, o.department_id, istDay(Math.floor(rnd(-1, 4))), status, ago(rnd(10, 60)),
          status !== 'assigned' ? ago(rnd(5, 9)) : null, ['done', 'verified'].includes(status) ? ago(rnd(1, 4)) : null);
      });
    }

    // ---- साहित्य मागणी ----
    for (const u of q.all("SELECT * FROM users WHERE role = 'worker' ORDER BY RANDOM() LIMIT 8")) {
      const items = [{ name: 'झाडू', qty: 2, unit: 'नग' }, { name: 'हातमोजे', qty: 3, unit: 'जोडी' }, { name: 'मास्क', qty: 10, unit: 'नग' }, { name: 'गमबूट', qty: 1, unit: 'जोडी' }]
        .sort(() => Math.random() - 0.5).slice(0, 2);
      const status = pick(['pending', 'pending', 'approved', 'issued']);
      const appr = approverFor(u);
      q.run(`INSERT INTO material_requests (request_no, user_id, items, reason, status, approver_id, decided_by, created_at, decided_at, issued_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        `MR-${Y}-${String(q.get('SELECT COUNT(*) AS c FROM material_requests').c + 1).padStart(5, '0')}`, u.id, JSON.stringify(items), 'जुने साहित्य खराब झाले',
        status, appr, status === 'pending' ? null : appr, ago(rnd(5, 100)), status === 'pending' ? null : ago(rnd(1, 4)), status === 'issued' ? ago(1) : null);
    }

    // ---- तातडीचे तक्रार प्रकार (High Priority) ----
    q.run("UPDATE categories SET priority = 'high' WHERE code IN ('dead_animal','drainage','water_leak','no_water')");
    q.run("UPDATE grievances SET priority = (SELECT priority FROM categories c WHERE c.id = grievances.category_id)");

    // ---- पाणीपट्टी (Water tax) ----
    const WATER = { RESIDENTIAL: 1800, COMMERCIAL: 4200, INDUSTRIAL: 9000, MIXED: 3000 };
    for (const pr of q.all('SELECT id, ward_id, property_type FROM properties')) {
      for (const yy of [fyNow - 1, fyNow]) {
        const amt = WATER[pr.property_type];
        const paidFull = Math.random() < (yy < fyNow ? 0.85 : 0.5);
        const aid = Number(q.run(`INSERT INTO tax_assessments (property_id, financial_year, tax_amount, total_payable, amount_paid, payment_status, tax_head, created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?)`, pr.id, `${yy}-${yy + 1}`, amt, amt, paidFull ? amt : 0, paidFull ? 'PAID' : 'PENDING', 'water', ago(500), ago(10)).lastInsertRowid);
        if (paidFull) {
          const paidAt = yy < fyNow ? new Date(Date.parse(`${yy}-07-01T10:00:00Z`) + rnd(0, 200) * 864e5).toISOString() : ago(rnd(0, 45 * 24));
          q.run(`INSERT INTO payments (transaction_id, assessment_id, ward_id, amount_paid, payment_mode, payment_gateway_response, payment_status, collected_by, paid_at)
            VALUES (?,?,?,?,?,?,?,?,?)`, `MNPDEMO${String(txnSeq++).padStart(6, '0')}`, aid, pr.ward_id, amt, pick(modes), '{"channel":"demo"}', 'SUCCESS', 1, paidAt);
        }
      }
    }

    // ---- अर्थसंकल्प व खर्च ----
    const fyLabel = `${fyNow}-${fyNow + 1}`;
    const BUDGET = { sanitation: 850, water: 1200, roads: 1500, electrical: 320, health: 540, drainage: 610, tax: 90, planning: 140 }; // लाख ₹
    const HEADS = { sanitation: ['कचरा गाड्या इंधन', 'कंत्राटी सफाई', 'डंपिंग ग्राउंड'], water: ['पाईपलाईन दुरुस्ती', 'जलशुद्धीकरण रसायने', 'वीज बिल (पंप)'],
      roads: ['रस्ते डांबरीकरण', 'खड्डे दुरुस्ती', 'फूटपाथ'], electrical: ['LED पथदिवे', 'वीज बिल', 'देखभाल'], health: ['औषधे', 'फवारणी मोहीम', 'रुग्णालय उपकरणे'],
      drainage: ['नालेसफाई', 'ड्रेनेज लाईन', 'पंपिंग स्टेशन'], tax: ['सर्वेक्षण', 'पावती छपाई'], planning: ['नगररचना सर्वेक्षण', 'GIS नकाशे'] };
    for (const [code, lakh] of Object.entries(BUDGET)) {
      const did = dept[code];
      q.run('INSERT OR REPLACE INTO dept_budgets (department_id, financial_year, budget_amount) VALUES (?,?,?)', did, fyLabel, lakh * 1e5);
      const target = lakh * 1e5 * rnd(0.32, 0.68); // वर्षाच्या मध्यात ३०-७०% खर्च
      let spent = 0;
      while (spent < target) {
        const amt = Math.round(rnd(0.02, 0.09) * lakh * 1e5);
        spent += amt;
        const when = new Date(Date.parse(`${fyNow}-04-05T10:00:00Z`) + rnd(0, Math.max(1, (Date.now() - Date.parse(`${fyNow}-04-05`)) / 864e5)) * 864e5);
        q.run('INSERT INTO expenditures (department_id, financial_year, amount, head, description, spent_at, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)',
          did, fyLabel, amt, pick(HEADS[code]), 'देयक मंजूर', when.toISOString().slice(0, 10), 1, when.toISOString());
      }
    }

    // ---- आपत्कालीन घटना ----
    const emerg = [
      ['tree_fall', 'high', 'मोठे झाड रस्त्यावर कोसळले', 'राजकमल चौक, जवाहर गेट', 25, 'active', 3],
      ['water_main', 'critical', 'मुख्य जलवाहिनी फुटली — परिसरात पाणी', 'राजापेठ उड्डाणपूल परिसर', 21, 'active', 1.5],
      ['fire', 'high', 'कचरा डेपोला आग', 'सुकळी कंपोस्ट डेपो, वडाळी', 15, 'resolved', 30],
      ['flood', 'medium', 'अंबा नाल्याला पूर — सखल भागात पाणी साचले', 'अंबा नाला परिसर, दस्तूर नगर', 33, 'resolved', 52],
    ];
    for (const [type, sev, title, loc, wid, status, h] of emerg) {
      const w0 = wards.find((x) => x.id === wid);
      const eid = Number(q.run(`INSERT INTO emergencies (type, severity, title, description, location, lat, lng, ward_id, status, reported_by, created_at, resolved_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, type, sev, title, 'नियंत्रण कक्षाला माहिती मिळाली', loc, w0.lat + rnd(-0.004, 0.004), w0.lng + rnd(-0.004, 0.004), wid,
      status, q.get("SELECT id FROM users WHERE role = 'officer' AND ward_id = ? LIMIT 1", wid)?.id || 1, ago(h), status === 'resolved' ? ago(h - 3) : null).lastInsertRowid);
      for (const [note, hh] of [['🚒 पथक घटनास्थळी रवाना', h - 0.2], ['👷 कर्मचारी व JCB पोहोचले, काम सुरू', h - 0.8]]) {
        q.run('INSERT INTO emergency_updates (emergency_id, user_id, note, created_at) VALUES (?,?,?,?)', eid, 1, note, ago(Math.max(0.05, hh)));
      }
    }

    // ---- तपासणी भेटी ----
    const inspTitles = [['सार्वजनिक शौचालय तपासणी', 'स्वच्छता दर्जा तपासणे'], ['बांधकाम स्थळ भेट', 'परवाना अटींचे पालन'], ['जलकुंभ तपासणी', 'पाण्याची गुणवत्ता'],
      ['नालेसफाई पाहणी', 'पावसाळापूर्व तयारी'], ['उद्यान देखभाल पाहणी', 'कंत्राटदाराचे काम']];
    for (const o of q.all("SELECT id, ward_id FROM users WHERE role = 'officer'")) {
      [0, 0, 2, -3].forEach((dd, k) => {
        const [title, purpose] = inspTitles[(o.id + k) % inspTitles.length];
        const done = dd < 0;
        q.run(`INSERT INTO inspections (officer_id, title, purpose, location, ward_id, scheduled_date, scheduled_time, status, findings, created_at, done_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`, o.id, title, purpose, `${pick(streets)}`, o.ward_id, istDay(dd), ['10:30', '15:00', '11:00', '12:00'][k],
        done ? 'done' : 'scheduled', done ? 'काम समाधानकारक; किरकोळ सुधारणा सुचवल्या' : null, ago(100), done ? ago(70) : null);
      });
    }

    // ---- अग्रीम / कर्ज अर्ज ----
    const advKinds = [['festival', 12500, 10], ['medical', 30000, 12], ['education', 25000, 10], ['salary', 9000, 1]];
    q.all("SELECT * FROM users WHERE role IN ('worker','clerk') ORDER BY RANDOM() LIMIT 9").forEach((u, i) => {
      const [kind, amt, inst] = advKinds[i % advKinds.length];
      const status = i < 4 ? 'pending' : i < 7 ? 'disbursed' : 'rejected';
      const appr = approverFor(u);
      q.run(`INSERT INTO advance_requests (request_no, user_id, kind, amount, installments, reason, status, approver_id, decided_by, remark, created_at, decided_at, disbursed_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, `ADV-${Y}-${String(i + 1).padStart(5, '0')}`, u.id, kind, amt, inst,
      ['दिवाळी सण', 'आईचे ऑपरेशन', 'मुलाची शाळा फी', 'घरगुती गरज'][i % 4], status, appr, status === 'pending' ? null : appr,
      status === 'rejected' ? 'या वर्षी आधीच अग्रीम घेतले आहे' : null, ago(rnd(30, 400)), status === 'pending' ? null : ago(rnd(25, 60) * 24),
      status === 'disbursed' ? ago(rnd(35, 70) * 24) : null);
    });

    // ---- आजची हजेरी + लाईव्ह लोकेशन (demo कर्मचारी 9100000001 व लिपिक 9400000011 सोडून — त्यांनी स्वतः हजेरी देऊन पहावी) ----
    const todayIst = istDay(0);
    {
      for (const u of q.all(`SELECT u.id, w.lat, w.lng FROM users u LEFT JOIN wards w ON w.id = u.ward_id
          WHERE u.role IN ('worker','clerk') AND u.mobile NOT IN ('9100000001','9400000011')
          AND NOT EXISTS (SELECT 1 FROM leave_requests l WHERE l.user_id = u.id AND l.status = 'approved' AND ? BETWEEN l.from_date AND l.to_date)`, todayIst)) {
        if (u.id % 8 === 0) continue; // ठराविक काही गैरहजर (demo साठी स्थिर)
        const inAt = new Date(`${todayIst}T0${6 + Math.floor(rnd(0, 3))}:${String(Math.floor(rnd(0, 59))).padStart(2, '0')}:00+05:30`);
        if (inAt > new Date()) continue;
        let lat = (u.lat || 20.93) + rnd(-0.006, 0.006);
        let lng = (u.lng || 77.75) + rnd(-0.006, 0.006);
        q.run(`INSERT OR IGNORE INTO attendance (user_id, date, check_in_at, check_in_lat, check_in_lng, check_in_distance_m, inside_geofence, face_verified, face_distance)
          VALUES (?,?,?,?,?,?,?,?,?)`, u.id, todayIst, inAt.toISOString(), lat, lng, Math.round(rnd(80, 1500)), 1, Math.random() > 0.05 ? 1 : 0, rnd(0.2, 0.5));
        for (let t = inAt.getTime(); t < Date.now(); t += 25 * 60e3) {
          lat += rnd(-0.0012, 0.0012); lng += rnd(-0.0012, 0.0012);
          q.run('INSERT INTO worker_locations (user_id, lat, lng, accuracy, at) VALUES (?,?,?,?,?)', u.id, lat, lng, rnd(5, 25), new Date(t).toISOString());
        }
      }
    }

    // ---- पाणी मीटर व मासिक रीडिंग (मागील ३ महिने) ----
    const TARIFF = [[10, 7], [30, 12], [Infinity, 20]];
    const billFor = (units, type) => {
      const f = ['COMMERCIAL', 'INDUSTRIAL'].includes(type) ? 2.5 : 1; let left = units; let from = 0; const rows = [];
      for (const [upto, rate] of TARIFF) { if (left <= 0) break; const u = Math.min(left, upto - from); rows.push({ label: upto === Infinity ? `${from}+ युनिट` : `${from + 1}–${upto} युनिट`, units: Math.round(u * 100) / 100, rate: rate * f, amount: Math.round(u * rate * f) }); left -= u; from = upto; }
      rows.push({ label: 'मीटर भाडे', units: null, rate: null, amount: 30 });
      return rows;
    };
    let billSeq = 1; let meterSeq = 1;
    const meterReaders = Object.fromEntries(q.all("SELECT u.ward_id, MIN(u.id) AS id FROM users u JOIN departments d ON d.id = u.department_id WHERE u.role = 'worker' AND d.code = 'water' GROUP BY u.ward_id").map((x) => [x.ward_id, x.id]));
    for (const pr of q.all("SELECT * FROM properties ORDER BY id")) {
      if (pr.id % 5 === 0) continue; // काही मालमत्तांना मीटर नाही
      let reading = Math.round(rnd(200, 3000));
      const mid = Number(q.run('INSERT INTO water_meters (property_id, meter_no, connection_size, installed_at, last_reading, last_read_at) VALUES (?,?,?,?,?,?)',
        pr.id, `WM-${String(pr.ward_id).padStart(2, '0')}-${String(meterSeq++).padStart(5, '0')}`, pr.property_type === 'RESIDENTIAL' ? '½ इंच' : '१ इंच', ago(900 * 24), reading, null).lastInsertRowid);
      // शेवटचे रीडिंग: पहिल्या पायलट प्रभागातील काही मालमत्ता आज वाचायच्या बाकी (३५+ दिवस) — मीटर रीडरच्या demo साठी
      const lastGap = pr.ward_id === PILOT[0] && pr.id % 3 === 0 ? 38 : rnd(2, 20);
      for (const back of [lastGap + 60, lastGap + 30, lastGap]) {
        const units = Math.round(rnd(pr.property_type === 'RESIDENTIAL' ? 8 : 20, pr.property_type === 'RESIDENTIAL' ? 28 : 80) * 10) / 10;
        const prev = reading; reading = Math.round((reading + units) * 10) / 10;
        const rows = billFor(units, pr.property_type);
        const at = ago(back * 24 + rnd(0, 8));
        const paid = back > lastGap || Math.random() < 0.4;
        q.run(`INSERT INTO meter_readings (meter_id, reading, previous, units, ocr_value, ocr_confidence, read_by, read_at, bill_no, bill_amount, bill_breakup, due_date, bill_status, paid_at, payment_mode, transaction_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, mid, reading, prev, units, String(Math.floor(reading)), rnd(70, 96), meterReaders[pr.ward_id] || 1, at,
        `WB-${Y}-${String(billSeq++).padStart(5, '0')}`, rows.reduce((t, x) => t + x.amount, 0), JSON.stringify(rows),
        new Date(Date.parse(at) + 15 * 864e5).toISOString().slice(0, 10), paid ? 'paid' : 'pending', paid ? ago((back - 5) * 24) : null, paid ? pick(['UPI', 'CASH', 'UPI']) : null, paid ? `MNPWDEMO${billSeq}` : null);
        q.run('UPDATE water_meters SET last_reading = ?, last_read_at = ? WHERE id = ?', reading, at, mid);
      }
    }

    // ---- पाणी टँकर फेऱ्या (OTP) ----
    const tankers = q.all("SELECT id, ward_id FROM vehicles WHERE type = 'tanker'");
    const tankerPlaces = [['छत्री तलाव परिसर', 'पाईपलाईन दुरुस्तीमुळे पाणी बंद'], ['भीमटेकडी वसाहत', 'पिण्याच्या पाण्याची टंचाई'], ['मनपा शाळा क्र. ५', 'शाळेसाठी पाणी'], ['नेहरू मैदान', 'उत्सव — पिण्याचे पाणी']];
    let trip = 1;
    for (const tk of tankers) {
      const driver = meterReaders[tk.ward_id];
      const w0 = wards.find((x) => x.id === tk.ward_id);
      for (let k = 0; k < 3; k++) {
        const [loc, purpose] = tankerPlaces[(tk.id + k) % tankerPlaces.length];
        const delivered = k > 0;
        const lat = w0.lat + rnd(-0.006, 0.006); const lng = w0.lng + rnd(-0.006, 0.006);
        const litres = pick([6000, 10000, 12000]);
        q.run(`INSERT INTO tanker_trips (trip_no, vehicle_id, driver_id, ward_id, location, lat, lng, citizen_name, citizen_mobile_enc, purpose, litres_requested, litres_delivered,
            otp_hash, otp_expires_at, status, created_by, created_at, delivered_at, delivered_lat, delivered_lng, delivery_distance_m)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, `TNK-${Y}-${String(trip).padStart(5, '0')}`, tk.id, driver, tk.ward_id, `${loc}, ${w0.name.split(' - ')[1]}`, lat, lng,
        `${pick(firstNames)} ${pick(lastNames)}`, encrypt(String(9500000000 + trip)), purpose, litres, delivered ? litres - pick([0, 0, 500]) : null,
        // demo OTP = 1234 (फक्त demo डेटासाठी; नवीन फेऱ्यांसाठी random OTP)
        sha256(`TNK-${Y}-${String(trip).padStart(5, '0')}:1234`), ago(-48), delivered ? 'delivered' : 'scheduled',
        q.get("SELECT id FROM users WHERE role = 'officer' AND department_id = ? AND (ward_id = ? OR ward_id IS NULL) ORDER BY ward_id IS NULL LIMIT 1", dept.water, tk.ward_id)?.id || 1,
        ago(rnd(2, 30)), delivered ? ago(rnd(1, 20)) : null, delivered ? lat + rnd(-0.0005, 0.0005) : null, delivered ? lng + rnd(-0.0005, 0.0005) : null, delivered ? Math.round(rnd(10, 120)) : null);
        trip++;
      }
    }

    // ---- आज पूर्ण झालेले कचरा गाडी मार्ग ----
    for (const rt of q.all('SELECT r.id, r.vehicle_id FROM vehicle_routes r WHERE r.active = 1')) {
      if (rt.vehicle_id % 3 === 0) continue; // या गाड्यांनी शेवटची गल्ली चुकवली
      q.run('INSERT OR IGNORE INTO route_completions (route_id, date, completed_at) VALUES (?,?,?)', rt.id, istDay(0), ago(rnd(1, 4)));
    }
  });
  console.log('✅ Demo डेटा तयार. Admin: 9000000001 / admin123 · अधिकारी: 9000000002 / officer123 · लिपिक: 9400000011 / clerk123 · कर्मचारी: 9100000001 / worker123');
}

export function seedIfEmpty() {
  if (q.get('SELECT COUNT(*) AS c FROM users').c === 0) seed();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((t) => t.name);
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of tables) db.exec(`DELETE FROM ${t}`);
  db.exec("DELETE FROM sqlite_sequence");
  db.exec('PRAGMA foreign_keys = ON');
  seed();
}
