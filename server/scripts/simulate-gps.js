// Demo: कचरा गाड्यांचे Live GPS सिम्युलेशन. एक गाडी मुद्दाम मार्ग सोडते → off-route अलर्ट तपासा.
// वापर: npm run simulate   (API चालू असावा)
import { db } from '../src/db.js';

const API = process.env.API || 'http://localhost:5000';
const vehicles = db.prepare(`SELECT v.id, v.reg_no, v.device_key, r.path FROM vehicles v
  JOIN vehicle_routes r ON r.vehicle_id = v.id AND r.active = 1 WHERE v.type = 'garbage' LIMIT 6`).all()
  .map((v, i) => ({ ...v, path: JSON.parse(v.path), step: 0, rogue: i === 0 }));

console.log(`🚛 ${vehicles.length} गाड्या चालू. ${vehicles[0]?.reg_no} मुद्दाम मार्ग सोडेल. (Ctrl+C थांबवा)`);
setInterval(async () => {
  for (const v of vehicles) {
    v.step = (v.step + 1) % 60;
    const pos = (v.step / 60) * (v.path.length - 1);
    const i = Math.min(v.path.length - 2, Math.floor(pos));
    const t = pos - i;
    let lng = v.path[i][0] + (v.path[i + 1][0] - v.path[i][0]) * t;
    let lat = v.path[i][1] + (v.path[i + 1][1] - v.path[i][1]) * t;
    if (v.rogue && v.step > 20 && v.step < 45) lat += 0.006; // ~६०० मी. बाहेर
    const speed = v.rogue && v.step === 30 ? 62 : 10 + Math.random() * 20;
    try {
      await fetch(`${API}/api/fleet/ping`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-device-key': v.device_key }, body: JSON.stringify({ lat, lng, speed }) });
    } catch (e) { console.error('API ला पोहोचता आले नाही:', e.message); }
  }
}, 3000);
