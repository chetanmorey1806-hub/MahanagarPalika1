// दोन GPS बिंदूंमधील अंतर (मीटरमध्ये) — Haversine formula
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// दिलेल्या ठिकाणासाठी सर्वात जवळचा वॉर्ड शोधा
export function nearestWard(wards, lat, lng) {
  let best = null;
  for (const w of wards) {
    const d = distanceMeters(lat, lng, w.lat, w.lng);
    if (!best || d < best.distance) best = { ward: w, distance: d };
  }
  return best;
}

// बिंदू polygon च्या आत आहे का (ray casting). ring = [[lng,lat],...]
export function pointInPolygon(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// बिंदूपासून मार्गाचे (polyline) सर्वात कमी अंतर, मीटरमध्ये. path = [[lng,lat],...]
export function distanceToPath(lat, lng, path) {
  const k = 111320; // equirectangular approximation — शहर पातळीवर पुरेसे अचूक
  const cos = Math.cos((lat * Math.PI) / 180);
  const px = lng * k * cos;
  const py = lat * k;
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const ax = path[i][0] * k * cos, ay = path[i][1] * k;
    const bx = path[i + 1][0] * k * cos, by = path[i + 1][1] * k;
    const dx = bx - ax, dy = by - ay;
    const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return Math.round(best);
}

// वॉर्ड शोधा: आधी boundary polygon, नसल्यास जवळचा केंद्रबिंदू
export function findWard(wards, lat, lng) {
  for (const w of wards) {
    if (w.boundary) {
      try { if (pointInPolygon(lat, lng, JSON.parse(w.boundary)[0])) return { ward: w, distance: 0, inside: true }; } catch { /* चुकीचा GeoJSON */ }
    }
  }
  const n = nearestWard(wards, lat, lng);
  return n && { ...n, inside: !n.ward.boundary && n.distance <= n.ward.radius_m };
}
