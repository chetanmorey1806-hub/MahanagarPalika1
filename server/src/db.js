// SQLite (Node चे built-in node:sqlite) — वेगळा DB server लागत नाही.
// Production मध्ये MySQL/PostgreSQL वर नेणे सोपे जावे म्हणून सर्व SQL साधे ठेवले आहेत.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS wards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  radius_m INTEGER NOT NULL DEFAULT 1500
);
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  mobile TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('worker','clerk','officer','admin')),
  designation TEXT,
  ward_id INTEGER REFERENCES wards(id),
  department_id INTEGER REFERENCES departments(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  check_in_at TEXT, check_in_lat REAL, check_in_lng REAL, check_in_photo TEXT, check_in_distance_m INTEGER,
  check_out_at TEXT, check_out_lat REAL, check_out_lng REAL, check_out_photo TEXT,
  inside_geofence INTEGER NOT NULL DEFAULT 1,
  UNIQUE (user_id, date)
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  sla_hours INTEGER NOT NULL DEFAULT 24
);
CREATE TABLE IF NOT EXISTS grievances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_no TEXT UNIQUE NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  department_id INTEGER NOT NULL REFERENCES departments(id),
  ward_id INTEGER REFERENCES wards(id),
  description TEXT,
  citizen_name TEXT,
  citizen_mobile_enc TEXT,
  lat REAL, lng REAL, address TEXT,
  source TEXT NOT NULL DEFAULT 'citizen',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','assigned','in_progress','resolved','closed','rejected')),
  officer_id INTEGER REFERENCES users(id),
  assigned_to INTEGER REFERENCES users(id),
  complaint_photo TEXT,
  before_photo TEXT, before_meta TEXT,
  after_photo TEXT, after_meta TEXT,
  sla_due_at TEXT NOT NULL,
  escalation_level INTEGER NOT NULL DEFAULT 0,
  escalated_at TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_grv_status ON grievances(status);
CREATE INDEX IF NOT EXISTS idx_grv_assigned ON grievances(assigned_to);
CREATE TABLE IF NOT EXISTS grievance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grievance_id INTEGER NOT NULL REFERENCES grievances(id),
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_no TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('birth','death','building','trade','water')),
  applicant_name TEXT NOT NULL,
  applicant_mobile_enc TEXT,
  details TEXT,
  ward_id INTEGER REFERENCES wards(id),
  department_id INTEGER REFERENCES departments(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by INTEGER REFERENCES users(id),
  remark TEXT,
  signature_path TEXT,
  sign_hash TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE TABLE IF NOT EXISTS efiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_no TEXT UNIQUE NOT NULL,
  subject TEXT NOT NULL,
  department_id INTEGER REFERENCES departments(id),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  current_holder INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS efile_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL REFERENCES efiles(id),
  from_user INTEGER REFERENCES users(id),
  to_user INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  remark TEXT,
  moved_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reg_no TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('garbage','tanker','jcb','car','ambulance')),
  ward_id INTEGER REFERENCES wards(id),
  driver_name TEXT,
  driver_mobile TEXT,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('running','idle','maintenance')),
  last_lat REAL, last_lng REAL, last_speed REAL, last_seen TEXT,
  device_key TEXT
);
CREATE TABLE IF NOT EXISTS vehicle_pings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  lat REAL NOT NULL, lng REAL NOT NULL, speed REAL,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fuel_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  litres REAL NOT NULL,
  amount REAL NOT NULL,
  odometer_km REAL,
  logged_by INTEGER REFERENCES users(id),
  logged_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS waste_trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER REFERENCES vehicles(id),
  ward_id INTEGER REFERENCES wards(id),
  tonnes REAL NOT NULL,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_no TEXT UNIQUE NOT NULL,
  owner_name TEXT NOT NULL,
  owner_mobile_enc TEXT,
  ward_id INTEGER REFERENCES wards(id),
  address TEXT,
  built_up_area_sqft REAL NOT NULL DEFAULT 0,
  property_type TEXT NOT NULL DEFAULT 'RESIDENTIAL' CHECK (property_type IN ('RESIDENTIAL','COMMERCIAL','INDUSTRIAL','MIXED')),
  lat REAL, lng REAL,
  gis_polygon TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tax_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  financial_year TEXT NOT NULL,
  tax_amount REAL NOT NULL,
  discount_amount REAL NOT NULL DEFAULT 0,
  penalty_amount REAL NOT NULL DEFAULT 0,
  total_payable REAL NOT NULL,
  amount_paid REAL NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING','PARTIAL','PAID')),
  tax_head TEXT NOT NULL DEFAULT 'property' CHECK (tax_head IN ('property','water')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (property_id, financial_year, tax_head)
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT UNIQUE NOT NULL,
  assessment_id INTEGER NOT NULL REFERENCES tax_assessments(id),
  ward_id INTEGER REFERENCES wards(id),
  amount_paid REAL NOT NULL,
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('UPI','CREDIT_CARD','DEBIT_CARD','NET_BANKING','CASH','CHEQUE')),
  payment_gateway_response TEXT,
  payment_status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (payment_status IN ('SUCCESS','FAILED','PENDING')),
  collected_by INTEGER REFERENCES users(id),
  paid_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pay_paid ON payments(paid_at);
CREATE TABLE IF NOT EXISTS vehicle_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  name TEXT NOT NULL,
  path TEXT NOT NULL,              -- GeoJSON LineString coordinates [[lng,lat],...]
  tolerance_m INTEGER NOT NULL DEFAULT 150,
  shift_start TEXT NOT NULL DEFAULT '06:00',
  shift_end TEXT NOT NULL DEFAULT '14:00',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS route_checkpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL REFERENCES vehicle_routes(id),
  name TEXT NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL,
  radius_m INTEGER NOT NULL DEFAULT 60
);
CREATE TABLE IF NOT EXISTS vehicle_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  type TEXT NOT NULL CHECK (type IN ('off_route','missed_checkpoint','overspeed','no_signal')),
  message TEXT NOT NULL,
  lat REAL, lng REAL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS route_check_runs (
  route_id INTEGER NOT NULL REFERENCES vehicle_routes(id),
  date TEXT NOT NULL,
  missed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (route_id, date)
);
CREATE INDEX IF NOT EXISTS idx_pings_vehicle_at ON vehicle_pings(vehicle_id, at);
CREATE TABLE IF NOT EXISTS work_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  ward_id INTEGER REFERENCES wards(id),
  text TEXT NOT NULL,
  via_voice INTEGER NOT NULL DEFAULT 0,
  photo TEXT,
  lat REAL, lng REAL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  endpoint TEXT UNIQUE NOT NULL,
  subscription TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT UNIQUE NOT NULL,
  file_path TEXT NOT NULL,
  summary TEXT NOT NULL,
  sent_to TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL DEFAULT 'app',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  meta TEXT,
  created_at TEXT NOT NULL
);
`);

// ---- HR व दैनंदिन कामकाज ----
db.exec(`
CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  leave_type TEXT NOT NULL CHECK (leave_type IN ('casual','sick','earned','other')),
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  days INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  approver_id INTEGER REFERENCES users(id),
  decided_by INTEGER REFERENCES users(id),
  remark TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_leave_user ON leave_requests(user_id, from_date);
CREATE TABLE IF NOT EXISTS holidays (
  date TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
  audience_role TEXT,              -- NULL = सर्व कर्मचारी
  department_id INTEGER REFERENCES departments(id),
  ward_id INTEGER REFERENCES wards(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notice_reads (
  notice_id INTEGER NOT NULL REFERENCES notices(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  read_at TEXT NOT NULL,
  PRIMARY KEY (notice_id, user_id)
);
CREATE TABLE IF NOT EXISTS work_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  assigned_to INTEGER NOT NULL REFERENCES users(id),
  assigned_by INTEGER NOT NULL REFERENCES users(id),
  ward_id INTEGER REFERENCES wards(id),
  department_id INTEGER REFERENCES departments(id),
  due_date TEXT NOT NULL,
  needs_photo INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','in_progress','done','verified','cancelled')),
  before_photo TEXT, after_photo TEXT, completion_note TEXT,
  lat REAL, lng REAL,
  created_at TEXT NOT NULL,
  started_at TEXT, completed_at TEXT, verified_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_wo_assigned ON work_orders(assigned_to, status);
CREATE TABLE IF NOT EXISTS material_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_no TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  items TEXT NOT NULL,             -- JSON [{name, qty, unit}]
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','issued')),
  approver_id INTEGER REFERENCES users(id),
  decided_by INTEGER REFERENCES users(id),
  remark TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  issued_at TEXT
);
`);

// जुन्या DB मध्ये नवीन columns जोडा (schema migration)
function addColumn(table, column, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
}
// जुन्या DB मध्ये role CHECK मध्ये 'clerk' नाही — users टेबल पुन्हा तयार करा (डेटा जपून)
{
  const def = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get()?.sql || '';
  if (def && !def.includes("'clerk'")) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(`CREATE TABLE users_new (${def.slice(def.indexOf('(') + 1, def.lastIndexOf(')')).replace("CHECK (role IN ('worker','officer','admin'))", "CHECK (role IN ('worker','clerk','officer','admin'))")})`);
      db.exec('INSERT INTO users_new SELECT * FROM users');
      db.exec('DROP TABLE users');
      db.exec('ALTER TABLE users_new RENAME TO users');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  }
}
addColumn('users', 'email', 'TEXT');
addColumn('users', 'signature_path', 'TEXT');
addColumn('users', 'employee_code', 'TEXT');
addColumn('users', 'basic_pay', 'REAL');
addColumn('users', 'joining_date', 'TEXT');
addColumn('wards', 'ward_number', 'INTEGER');
addColumn('wards', 'boundary', 'TEXT'); // GeoJSON Polygon coordinates [[[lng,lat],...]]
addColumn('grievances', 'citizen_rating', 'INTEGER');
addColumn('grievances', 'citizen_feedback', 'TEXT');
addColumn('grievances', 'reopen_count', 'INTEGER NOT NULL DEFAULT 0');
addColumn('vehicles', 'capacity_tons', 'REAL');
addColumn('vehicles', 'off_route_since', 'TEXT');

// टेबल पुन्हा तयार करा (constraint बदलण्यासाठी) — समान columns चा डेटा जपला जातो
function rebuildTable(name, createSql) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(createSql.replace(`CREATE TABLE IF NOT EXISTS ${name} (`, `CREATE TABLE ${name}_new (`));
    const oldCols = db.prepare(`PRAGMA table_info(${name})`).all().map((c) => c.name);
    const newCols = db.prepare(`PRAGMA table_info(${name}_new)`).all().map((c) => c.name);
    const cols = oldCols.filter((c) => newCols.includes(c)).join(', ');
    db.exec(`INSERT INTO ${name}_new (${cols}) SELECT ${cols} FROM ${name}`);
    db.exec(`DROP TABLE ${name}`);
    db.exec(`ALTER TABLE ${name}_new RENAME TO ${name}`);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}
if (!db.prepare('PRAGMA table_info(tax_assessments)').all().some((c) => c.name === 'tax_head')) {
  const def = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'tax_assessments'").get().sql
    .replace("payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING','PARTIAL','PAID')),",
      "payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING','PARTIAL','PAID')),\n  tax_head TEXT NOT NULL DEFAULT 'property' CHECK (tax_head IN ('property','water')),")
    .replace('UNIQUE (property_id, financial_year)', 'UNIQUE (property_id, financial_year, tax_head)')
    .replace('CREATE TABLE tax_assessments (', 'CREATE TABLE IF NOT EXISTS tax_assessments (');
  rebuildTable('tax_assessments', def);
}

addColumn('categories', 'priority', "TEXT NOT NULL DEFAULT 'normal'");
addColumn('grievances', 'priority', "TEXT NOT NULL DEFAULT 'normal'");
addColumn('users', 'face_descriptor', 'TEXT');   // चेहरा ओळख — 128 अंकी descriptor (JSON)
addColumn('attendance', 'face_distance', 'REAL');
addColumn('attendance', 'face_verified', 'INTEGER');
addColumn('properties', 'last_notice_at', 'TEXT');

// ---- टप्पा ४: डॅशबोर्ड, आपत्कालीन, तपासणी, अग्रीम, लाईव्ह लोकेशन, बजेट ----
db.exec(`
CREATE TABLE IF NOT EXISTS dept_budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  financial_year TEXT NOT NULL,
  budget_amount REAL NOT NULL,
  UNIQUE (department_id, financial_year)
);
CREATE TABLE IF NOT EXISTS expenditures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  financial_year TEXT NOT NULL,
  amount REAL NOT NULL,
  head TEXT NOT NULL,
  description TEXT,
  spent_at TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS emergencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('fire','flood','tree_fall','building_collapse','accident','water_main','other')),
  severity TEXT NOT NULL DEFAULT 'high' CHECK (severity IN ('medium','high','critical')),
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  lat REAL, lng REAL,
  ward_id INTEGER REFERENCES wards(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved')),
  photo TEXT,
  reported_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS emergency_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emergency_id INTEGER NOT NULL REFERENCES emergencies(id),
  user_id INTEGER REFERENCES users(id),
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  officer_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  purpose TEXT,
  location TEXT,
  lat REAL, lng REAL,
  ward_id INTEGER REFERENCES wards(id),
  scheduled_date TEXT NOT NULL,
  scheduled_time TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','done','cancelled')),
  findings TEXT,
  photo TEXT, photo_meta TEXT,
  created_at TEXT NOT NULL,
  done_at TEXT
);
CREATE TABLE IF NOT EXISTS advance_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_no TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('festival','salary','medical','education','house_loan','vehicle_loan')),
  amount REAL NOT NULL,
  installments INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','disbursed','cancelled')),
  approver_id INTEGER REFERENCES users(id),
  decided_by INTEGER REFERENCES users(id),
  remark TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  disbursed_at TEXT
);
CREATE TABLE IF NOT EXISTS worker_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  lat REAL NOT NULL, lng REAL NOT NULL, accuracy REAL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wloc_user_at ON worker_locations(user_id, at);
CREATE TABLE IF NOT EXISTS water_meters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL UNIQUE REFERENCES properties(id),
  meter_no TEXT UNIQUE NOT NULL,
  connection_size TEXT NOT NULL DEFAULT '½ इंच',
  installed_at TEXT,
  last_reading REAL NOT NULL DEFAULT 0,
  last_read_at TEXT
);
CREATE TABLE IF NOT EXISTS meter_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meter_id INTEGER NOT NULL REFERENCES water_meters(id),
  reading REAL NOT NULL,
  previous REAL NOT NULL,
  units REAL NOT NULL,
  photo TEXT,
  ocr_value TEXT,
  ocr_confidence REAL,
  manual_override INTEGER NOT NULL DEFAULT 0,
  lat REAL, lng REAL,
  read_by INTEGER REFERENCES users(id),
  read_at TEXT NOT NULL,
  bill_no TEXT UNIQUE NOT NULL,
  bill_amount REAL NOT NULL,
  bill_breakup TEXT,
  due_date TEXT NOT NULL,
  bill_status TEXT NOT NULL DEFAULT 'pending' CHECK (bill_status IN ('pending','paid')),
  paid_at TEXT, payment_mode TEXT, transaction_id TEXT, collected_by INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_mread_meter ON meter_readings(meter_id, read_at);
CREATE TABLE IF NOT EXISTS tanker_trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_no TEXT UNIQUE NOT NULL,
  vehicle_id INTEGER REFERENCES vehicles(id),
  driver_id INTEGER REFERENCES users(id),
  ward_id INTEGER REFERENCES wards(id),
  location TEXT NOT NULL,
  lat REAL, lng REAL,
  citizen_name TEXT,
  citizen_mobile_enc TEXT,
  purpose TEXT,
  litres_requested INTEGER NOT NULL,
  litres_delivered INTEGER,
  otp_hash TEXT,
  otp_expires_at TEXT,
  otp_attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','delivered','cancelled')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  delivered_at TEXT, delivered_lat REAL, delivered_lng REAL, delivery_distance_m INTEGER
);
CREATE TABLE IF NOT EXISTS route_completions (
  route_id INTEGER NOT NULL REFERENCES vehicle_routes(id),
  date TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (route_id, date)
);
`);

// node:sqlite मध्ये undefined चालत नाही — null मध्ये बदला
const clean = (params) => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p));

export const q = {
  all: (sql, ...p) => db.prepare(sql).all(...clean(p)),
  get: (sql, ...p) => db.prepare(sql).get(...clean(p)),
  run: (sql, ...p) => db.prepare(sql).run(...clean(p)),
};

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const now = () => new Date().toISOString();
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export function audit(userId, action, entity, entityId, meta) {
  q.run('INSERT INTO audit_logs (user_id, action, entity, entity_id, meta, created_at) VALUES (?,?,?,?,?,?)',
    userId, action, entity, entityId, meta ? JSON.stringify(meta) : null, now());
}

export function nextNumber(prefix, table, column) {
  const year = new Date().getFullYear();
  // सर्वात मोठ्या क्रमांकाच्या पुढचा (COUNT वापरल्यास मधला रेकॉर्ड हटल्यास duplicate होऊ शकतो)
  const p = `${prefix}-${year}-`;
  const row = q.get(`SELECT MAX(CAST(substr(${column}, ?) AS INTEGER)) AS n FROM ${table} WHERE ${column} LIKE ?`, p.length + 1, `${p}%`);
  return `${p}${String((row.n || 0) + 1).padStart(5, '0')}`;
}
