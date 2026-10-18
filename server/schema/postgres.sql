-- =====================================================================
-- महानगरपालिका ERP — PostgreSQL + PostGIS Production Schema
-- =====================================================================
-- सध्याचे app SQLite (src/db.js) वर चालते. मोठ्या प्रमाणावर (लाखो GPS/log रेकॉर्ड)
-- जाताना हा schema वापरा. नावे व नाती src/db.js शी जुळतात, आणि खालील best practices लागू आहेत:
--   • PostGIS geometry + GIST spatial index (geo-fencing, जवळचा वॉर्ड, मार्ग)
--   • vehicle_gps_logs व grievance_logs वर महिन्यानुसार partitioning
--   • प्रत्येक मुख्य टेबलवर created_at, updated_at, is_deleted (soft delete)
--   • gateway response / IoT raw डेटा / config साठी JSONB
--
-- वापर:  createdb mnp && psql -d mnp -f schema/postgres.sql
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- updated_at आपोआप बदलण्यासाठी trigger
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- ENUM प्रकार
-- ---------------------------------------------------------------------
CREATE TYPE user_role        AS ENUM ('CITIZEN', 'WORKER', 'OFFICER', 'ADMIN');
CREATE TYPE grievance_status AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED', 'REJECTED');
CREATE TYPE property_type    AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'MIXED');
CREATE TYPE assess_status    AS ENUM ('PENDING', 'PARTIAL', 'PAID');
CREATE TYPE payment_mode     AS ENUM ('UPI', 'CREDIT_CARD', 'DEBIT_CARD', 'NET_BANKING', 'CASH', 'CHEQUE');
CREATE TYPE payment_status   AS ENUM ('SUCCESS', 'FAILED', 'PENDING');
CREATE TYPE vehicle_alert    AS ENUM ('OFF_ROUTE', 'MISSED_CHECKPOINT', 'OVERSPEED', 'NO_SIGNAL');

-- ---------------------------------------------------------------------
-- २. Master Data — प्रभाग व विभाग
-- ---------------------------------------------------------------------
CREATE TABLE wards (
  ward_id          SERIAL PRIMARY KEY,
  ward_number      INT NOT NULL UNIQUE,
  ward_name        VARCHAR(100) NOT NULL,
  boundary_polygon GEOMETRY(MultiPolygon, 4326),
  center_point     GEOMETRY(Point, 4326),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted       BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_wards_boundary ON wards USING GIST (boundary_polygon);

CREATE TABLE departments (
  department_id   SERIAL PRIMARY KEY,
  code            VARCHAR(30) NOT NULL UNIQUE,
  department_name VARCHAR(100) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted      BOOLEAN NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------
-- १. User Management
-- ---------------------------------------------------------------------
CREATE TABLE users (
  user_id        BIGSERIAL PRIMARY KEY,
  full_name      VARCHAR(150) NOT NULL,
  email          VARCHAR(100) UNIQUE,
  phone_number   VARCHAR(15) NOT NULL UNIQUE,
  password_hash  VARCHAR(255),              -- नागरिक OTP ने लॉगिन करत असल्यास NULL
  role           user_role NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted     BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE employees (
  employee_id     BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL UNIQUE REFERENCES users(user_id),
  department_id   INT REFERENCES departments(department_id),
  ward_id         INT REFERENCES wards(ward_id),        -- NULL = सर्व प्रभाग (विभाग प्रमुख)
  designation     VARCHAR(100),
  signature_url   VARCHAR(500),                          -- एका-क्लिक मंजुरीसाठी जतन केलेली सही
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted      BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_emp_scope ON employees (department_id, ward_id) WHERE is_active;

CREATE TABLE attendance (
  attendance_id   BIGSERIAL PRIMARY KEY,
  employee_id     BIGINT NOT NULL REFERENCES employees(employee_id),
  work_date       DATE NOT NULL,
  check_in_at     TIMESTAMPTZ,
  check_in_point  GEOMETRY(Point, 4326),
  check_in_photo  VARCHAR(500),
  check_out_at    TIMESTAMPTZ,
  check_out_point GEOMETRY(Point, 4326),
  inside_geofence BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, work_date)
);

-- ---------------------------------------------------------------------
-- ३. Grievance Management
-- ---------------------------------------------------------------------
CREATE TABLE grievance_categories (
  category_id    SERIAL PRIMARY KEY,
  code           VARCHAR(40) NOT NULL UNIQUE,
  category_name  VARCHAR(100) NOT NULL,
  department_id  INT NOT NULL REFERENCES departments(department_id),
  sla_hours      INT NOT NULL DEFAULT 24,
  icon           VARCHAR(10)
);

CREATE TABLE grievances (
  grievance_id        BIGSERIAL PRIMARY KEY,
  ticket_number       VARCHAR(50) NOT NULL UNIQUE,
  citizen_id          BIGINT REFERENCES users(user_id),
  category_id         INT NOT NULL REFERENCES grievance_categories(category_id),
  ward_id             INT REFERENCES wards(ward_id),
  description         TEXT,
  photo_url           VARCHAR(500),
  latitude            DECIMAL(10, 8),
  longitude           DECIMAL(11, 8),
  location_point      GEOMETRY(Point, 4326),
  source              VARCHAR(20) NOT NULL DEFAULT 'citizen',
  status              grievance_status NOT NULL DEFAULT 'OPEN',
  assigned_officer_id BIGINT REFERENCES employees(employee_id),
  assigned_worker_id  BIGINT REFERENCES employees(employee_id),
  sla_due_at          TIMESTAMPTZ NOT NULL,
  escalation_level    SMALLINT NOT NULL DEFAULT 0,
  reopen_count        SMALLINT NOT NULL DEFAULT 0,
  citizen_rating      SMALLINT CHECK (citizen_rating BETWEEN 1 AND 5),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at         TIMESTAMPTZ,
  is_deleted          BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_grv_location ON grievances USING GIST (location_point);
CREATE INDEX idx_grv_open_sla ON grievances (sla_due_at) WHERE status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'REOPENED');
CREATE INDEX idx_grv_worker   ON grievances (assigned_worker_id, status);

-- तक्रारीचा इतिहास — महिन्यानुसार partition
CREATE TABLE grievance_logs (
  log_id                   BIGSERIAL,
  grievance_id             BIGINT NOT NULL,
  updated_by               BIGINT,
  status                   VARCHAR(50),
  action_taken_description TEXT,
  proof_photo_url          VARCHAR(500),
  meta                     JSONB,                  -- GPS, device, watermark वेळ
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (log_id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX idx_glog_grievance ON grievance_logs (grievance_id);

-- ---------------------------------------------------------------------
-- ४. Revenue & Property Tax
-- ---------------------------------------------------------------------
CREATE TABLE properties (
  property_id        BIGSERIAL PRIMARY KEY,
  property_number    VARCHAR(50) NOT NULL UNIQUE,
  owner_user_id      BIGINT REFERENCES users(user_id),
  ward_id            INT NOT NULL REFERENCES wards(ward_id),
  address            TEXT,
  built_up_area_sqft DECIMAL(10, 2) NOT NULL,
  property_type      property_type NOT NULL,
  gis_polygon        GEOMETRY(Polygon, 4326),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted         BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_prop_gis  ON properties USING GIST (gis_polygon);
CREATE INDEX idx_prop_ward ON properties (ward_id) WHERE NOT is_deleted;

CREATE TABLE tax_assessments (
  assessment_id   BIGSERIAL PRIMARY KEY,
  property_id     BIGINT NOT NULL REFERENCES properties(property_id),
  financial_year  VARCHAR(10) NOT NULL,          -- "2026-2027"
  tax_amount      DECIMAL(12, 2) NOT NULL,
  discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  penalty_amount  DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_payable   DECIMAL(12, 2) NOT NULL,
  amount_paid     DECIMAL(12, 2) NOT NULL DEFAULT 0,
  payment_status  assess_status NOT NULL DEFAULT 'PENDING',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, financial_year)
);

CREATE TABLE payments (
  payment_id               BIGSERIAL PRIMARY KEY,
  transaction_id           VARCHAR(100) NOT NULL UNIQUE,
  assessment_id            BIGINT NOT NULL REFERENCES tax_assessments(assessment_id),
  amount_paid              DECIMAL(12, 2) NOT NULL,
  payment_mode             payment_mode NOT NULL,
  payment_gateway_response JSONB,
  payment_status           payment_status NOT NULL DEFAULT 'PENDING',
  collected_by             BIGINT REFERENCES employees(employee_id),
  paid_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pay_paid_at ON payments (paid_at) WHERE payment_status = 'SUCCESS';

-- ---------------------------------------------------------------------
-- ५. Garbage Fleet & IoT
-- ---------------------------------------------------------------------
CREATE TABLE vehicles (
  vehicle_id         SERIAL PRIMARY KEY,
  vehicle_number     VARCHAR(20) NOT NULL UNIQUE,
  vehicle_type       VARCHAR(20) NOT NULL,
  gps_device_id      VARCHAR(100) UNIQUE,
  assigned_driver_id BIGINT REFERENCES employees(employee_id),
  ward_id            INT REFERENCES wards(ward_id),
  capacity_tons      DECIMAL(5, 2),
  config             JSONB,                       -- डिव्हाइस/सेन्सर सेटिंग्ज
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted         BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE vehicle_routes (
  route_id     SERIAL PRIMARY KEY,
  vehicle_id   INT NOT NULL REFERENCES vehicles(vehicle_id),
  route_name   VARCHAR(100) NOT NULL,
  path         GEOMETRY(LineString, 4326) NOT NULL,
  tolerance_m  INT NOT NULL DEFAULT 150,
  shift_start  TIME NOT NULL DEFAULT '06:00',
  shift_end    TIME NOT NULL DEFAULT '14:00',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_route_path ON vehicle_routes USING GIST (path);

CREATE TABLE route_checkpoints (
  checkpoint_id SERIAL PRIMARY KEY,
  route_id      INT NOT NULL REFERENCES vehicle_routes(route_id),
  name          VARCHAR(100) NOT NULL,
  point         GEOMETRY(Point, 4326) NOT NULL,
  radius_m      INT NOT NULL DEFAULT 60
);
CREATE INDEX idx_cp_point ON route_checkpoints USING GIST (point);

-- Real-time GPS — रोज लाखो रेकॉर्ड, म्हणून महिन्यानुसार partition
CREATE TABLE vehicle_gps_logs (
  log_id     BIGSERIAL,
  vehicle_id INT NOT NULL,
  latitude   DECIMAL(10, 8) NOT NULL,
  longitude  DECIMAL(11, 8) NOT NULL,
  point      GEOMETRY(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED,
  speed      DECIMAL(5, 2),
  raw        JSONB,                               -- IoT डिव्हाइसचा मूळ डेटा
  logged_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (log_id, logged_at)
) PARTITION BY RANGE (logged_at);
CREATE INDEX idx_gps_vehicle_time ON vehicle_gps_logs (vehicle_id, logged_at DESC);
CREATE INDEX idx_gps_point ON vehicle_gps_logs USING GIST (point);

CREATE TABLE vehicle_alerts (
  alert_id   BIGSERIAL PRIMARY KEY,
  vehicle_id INT NOT NULL REFERENCES vehicles(vehicle_id),
  type       vehicle_alert NOT NULL,
  message    TEXT NOT NULL,
  point      GEOMETRY(Point, 4326),
  resolved   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
  audit_id   BIGSERIAL PRIMARY KEY,
  user_id    BIGINT,
  action     VARCHAR(60) NOT NULL,
  entity     VARCHAR(60),
  entity_id  BIGINT,
  meta       JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at triggers
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['wards','departments','users','employees','grievances','properties','tax_assessments','vehicles'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Partitions: चालू + पुढील ११ महिने. दर महिन्याला cron ने पुढचा partition तयार करा:
--   SELECT create_month_partitions(date_trunc('month', now() + interval '12 month')::date, 1);
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_month_partitions(start_month DATE, months INT) RETURNS void AS $$
DECLARE m DATE; tbl TEXT;
BEGIN
  FOR i IN 0..months - 1 LOOP
    m := (date_trunc('month', start_month) + make_interval(months => i))::date;
    FOREACH tbl IN ARRAY ARRAY['vehicle_gps_logs', 'grievance_logs'] LOOP
      EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
        tbl || '_' || to_char(m, 'YYYY_MM'), tbl, m, (m + interval '1 month')::date);
    END LOOP;
  END LOOP;
END $$ LANGUAGE plpgsql;
SELECT create_month_partitions(date_trunc('month', now())::date, 12);

-- ---------------------------------------------------------------------
-- उपयोगी spatial queries (PostGIS)
-- ---------------------------------------------------------------------
-- बिंदू कोणत्या प्रभागात (तक्रार auto-routing / हजेरी geo-fence):
--   SELECT ward_id FROM wards WHERE ST_Contains(boundary_polygon, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)) AND NOT is_deleted;
-- गाडी ठरलेल्या मार्गापासून किती मीटर दूर:
--   SELECT ST_Distance(path::geography, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) FROM vehicle_routes WHERE vehicle_id = :id AND is_active;
-- आज कोणते checkpoints चुकले:
--   SELECT c.name FROM route_checkpoints c WHERE c.route_id = :rid AND NOT EXISTS (
--     SELECT 1 FROM vehicle_gps_logs g WHERE g.vehicle_id = :vid AND g.logged_at >= :shift_start AND g.logged_at <= :shift_end
--       AND ST_DWithin(g.point::geography, c.point::geography, c.radius_m));
