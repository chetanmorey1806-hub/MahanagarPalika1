// Smart Route Geo-fencing: गाडी ठरलेल्या मार्गावरून बाहेर गेली, एखादी गल्ली (checkpoint) चुकवली,
// जास्त वेगात चालली किंवा GPS सिग्नल बंद झाला तर सुपरवायझरला आपोआप अलर्ट.
import { q, now, today } from '../db.js';
import { distanceMeters, distanceToPath } from '../utils/geo.js';
import { notify } from '../utils/notify.js';
import { emit } from '../live.js';

const OFF_ROUTE_GRACE_MS = Number(process.env.OFF_ROUTE_GRACE_SECONDS || 120) * 1000;
const OVERSPEED_KMPH = Number(process.env.OVERSPEED_KMPH || 50);
const NO_SIGNAL_MIN = 15;

const istHM = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(11, 16);
const inShift = (route, hm = istHM()) => hm >= route.shift_start && hm <= route.shift_end;
// IST तारीख + HH:MM → UTC ISO
const istToIso = (date, hm) => new Date(`${date}T${hm}:00+05:30`).toISOString();

// वाहनाच्या प्रभागाचे अधिकारी (घनकचरा/पाणी) + विभाग प्रमुख
function supervisors(vehicle) {
  const dept = vehicle.type === 'tanker' ? 'water' : 'sanitation';
  return q.all(`SELECT u.id FROM users u JOIN departments d ON d.id = u.department_id
    WHERE u.role = 'officer' AND u.active = 1 AND d.code = ? AND (u.ward_id = ? OR u.ward_id IS NULL)`, dept, vehicle.ward_id);
}

function raiseAlert(vehicle, type, message, lat, lng, throttleMin = 30) {
  const recent = q.get(`SELECT id FROM vehicle_alerts WHERE vehicle_id = ? AND type = ? AND resolved = 0 AND created_at > ?`,
    vehicle.id, type, new Date(Date.now() - throttleMin * 60e3).toISOString());
  if (recent) return;
  q.run('INSERT INTO vehicle_alerts (vehicle_id, type, message, lat, lng, created_at) VALUES (?,?,?,?,?,?)', vehicle.id, type, message, lat, lng, now());
  for (const s of supervisors(vehicle)) notify(s.id, `🚨 वाहन अलर्ट: ${vehicle.reg_no}`, message, '/fleet');
  emit('alert', { vehicle_id: vehicle.id, type, message });
}

// प्रत्येक GPS ping वर
export function checkPing(vehicle, lat, lng, speed) {
  if (speed > OVERSPEED_KMPH) {
    raiseAlert(vehicle, 'overspeed', `${vehicle.reg_no} ${Math.round(speed)} km/h वेगाने (मर्यादा ${OVERSPEED_KMPH})`, lat, lng);
  }
  const route = q.get('SELECT * FROM vehicle_routes WHERE vehicle_id = ? AND active = 1 ORDER BY id DESC LIMIT 1', vehicle.id);
  if (!route || !inShift(route)) return;
  const dist = distanceToPath(lat, lng, JSON.parse(route.path));
  if (dist > route.tolerance_m) {
    if (!vehicle.off_route_since) {
      q.run('UPDATE vehicles SET off_route_since = ? WHERE id = ?', now(), vehicle.id);
    } else if (Date.now() - Date.parse(vehicle.off_route_since) > OFF_ROUTE_GRACE_MS) {
      raiseAlert(vehicle, 'off_route', `${vehicle.reg_no} ठरलेल्या मार्गावरून (${route.name}) ${dist} मी. बाहेर गेली आहे — चालक: ${vehicle.driver_name || '—'}`, lat, lng);
    }
    return;
  } else if (vehicle.off_route_since) {
    q.run('UPDATE vehicles SET off_route_since = NULL WHERE id = ?', vehicle.id);
    q.run("UPDATE vehicle_alerts SET resolved = 1 WHERE vehicle_id = ? AND type = 'off_route' AND resolved = 0", vehicle.id);
  }
  checkRouteCompleted(vehicle, route);
}

// सर्व थांबे (गल्ल्या) गाठले आणि गाडी मार्गाच्या शेवटच्या बिंदूजवळ → "मार्ग पूर्ण" आपोआप
export function checkRouteCompleted(vehicle, route, date = today()) {
  if (q.get('SELECT 1 FROM route_completions WHERE route_id = ? AND date = ?', route.id, date)) return false;
  const cps = checkpointStatus(route, date);
  if (!cps.length || cps.some((c) => !c.visited)) return false;
  const path = JSON.parse(route.path);
  const [elng, elat] = path[path.length - 1];
  const from = istToIso(date, route.shift_start);
  const reachedEnd = q.all('SELECT lat, lng FROM vehicle_pings WHERE vehicle_id = ? AND at >= ? ORDER BY id DESC LIMIT 30', route.vehicle_id, from)
    .some((p) => distanceMeters(p.lat, p.lng, elat, elng) <= 120);
  if (!reachedEnd) return false;
  q.run('INSERT OR IGNORE INTO route_completions (route_id, date, completed_at) VALUES (?,?,?)', route.id, date, now());
  for (const s of supervisors(vehicle)) notify(s.id, `✅ मार्ग पूर्ण: ${vehicle.reg_no}`, `${route.name} — सर्व ${cps.length} थांबे पूर्ण`, '/fleet');
  emit('alert', { vehicle_id: vehicle.id, type: 'route_completed' });
  return true;
}

// आजच्या पाळीतील checkpoints पैकी कोणते गाठले
export function checkpointStatus(route, date = today()) {
  const from = istToIso(date, route.shift_start);
  const to = istToIso(date, route.shift_end);
  const pings = q.all('SELECT lat, lng, at FROM vehicle_pings WHERE vehicle_id = ? AND at >= ? AND at <= ?', route.vehicle_id, from, to);
  return q.all('SELECT * FROM route_checkpoints WHERE route_id = ? ORDER BY id', route.id).map((c) => {
    const hit = pings.find((p) => distanceMeters(p.lat, p.lng, c.lat, c.lng) <= c.radius_m);
    return { ...c, visited: !!hit, visited_at: hit?.at || null };
  });
}

// दर ५ मिनिटांनी: पाळी संपलेल्या मार्गांचे चुकलेले checkpoints, आणि GPS सिग्नल बंद
export function runRouteWatch() {
  const date = today();
  const hm = istHM();
  for (const route of q.all('SELECT r.*, v.reg_no, v.ward_id, v.type, v.driver_name, v.last_seen, v.status FROM vehicle_routes r JOIN vehicles v ON v.id = r.vehicle_id WHERE r.active = 1')) {
    const vehicle = { id: route.vehicle_id, reg_no: route.reg_no, ward_id: route.ward_id, type: route.type, driver_name: route.driver_name };
    if (inShift(route, hm) && route.status !== 'maintenance' && (!route.last_seen || Date.now() - Date.parse(route.last_seen) > NO_SIGNAL_MIN * 60e3)) {
      raiseAlert(vehicle, 'no_signal', `${route.reg_no} चा GPS सिग्नल ${NO_SIGNAL_MIN}+ मिनिटे मिळत नाही (पाळी चालू आहे)`, null, null, 60);
    }
    if (hm > route.shift_end && !q.get('SELECT 1 FROM route_check_runs WHERE route_id = ? AND date = ?', route.id, date)) {
      const missed = checkpointStatus(route, date).filter((c) => !c.visited);
      q.run('INSERT INTO route_check_runs (route_id, date, missed) VALUES (?,?,?)', route.id, date, missed.length);
      if (missed.length) {
        raiseAlert(vehicle, 'missed_checkpoint', `${route.reg_no} (${route.name}) आज ${missed.length} ठिकाणी गेली नाही: ${missed.map((c) => c.name).join(', ')}`, missed[0].lat, missed[0].lng, 0);
      }
    }
  }
}
