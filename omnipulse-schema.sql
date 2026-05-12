-- ============================================================
-- OmniPulse — Schema maestro v1.0
-- PostgreSQL 16 + TimescaleDB
-- Ejecutar en: pulsecosta_db (renombrar a omnipulse_db en el futuro)
-- ============================================================

-- ── SCHEMAS ─────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS core;       -- auth, usuarios, organizaciones
CREATE SCHEMA IF NOT EXISTS crm;        -- pipeline comercial
CREATE SCHEMA IF NOT EXISTS ops;        -- gestión interna OmniPulse OÜ
CREATE SCHEMA IF NOT EXISTS pwa;        -- datos PWA multi-tenant
CREATE SCHEMA IF NOT EXISTS analytics;  -- Pulse City + OmniPulse predictivo

-- ============================================================
-- SCHEMA: core
-- Compartido por TODOS los productos del ecosistema
-- ============================================================

-- Organizaciones / tenants (Costa del Sol, Helsinki, etc.)
CREATE TABLE IF NOT EXISTS core.organizations (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,               -- "PulseCosta Costa del Sol"
  slug        TEXT UNIQUE NOT NULL,         -- "costa-del-sol"
  country     TEXT DEFAULT 'ES',
  timezone    TEXT DEFAULT 'Europe/Madrid',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Usuarios unificados — un solo login para todo el ecosistema
CREATE TABLE IF NOT EXISTS core.users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  initials      TEXT GENERATED ALWAYS AS (
    upper(left(split_part(name,' ',1),1) || left(split_part(name,' ',2),1))
  ) STORED,
  avatar_url    TEXT,
  active        BOOLEAN DEFAULT true,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Roles por usuario y organización (un user puede tener roles en varias orgs)
CREATE TABLE IF NOT EXISTS core.user_roles (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  org_id     INTEGER NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  -- Roles disponibles: super_admin | ops_admin | sales_admin | sales_rep |
  --                    cs_manager | finance_admin | worker | freelance | read_only
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, org_id, role)
);

-- Audit log inmutable — no permite DELETE por policy
CREATE TABLE IF NOT EXISTS core.audit_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES core.users(id) ON DELETE SET NULL,
  org_id      INTEGER REFERENCES core.organizations(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,       -- 'INSERT','UPDATE','DELETE','LOGIN','LOGOUT'
  table_name  TEXT,
  record_id   TEXT,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- IP blocklist para seguridad (gestionada desde dashboard/bot)
CREATE TABLE IF NOT EXISTS core.blocked_ips (
  id          SERIAL PRIMARY KEY,
  ip_address  INET NOT NULL UNIQUE,
  reason      TEXT,
  blocked_by  INTEGER REFERENCES core.users(id),
  blocked_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ               -- NULL = permanente
);

-- ── Datos iniciales: primera organización ───────────────────
INSERT INTO core.organizations (name, slug, country, timezone)
VALUES ('PulseCosta Costa del Sol', 'costa-del-sol', 'ES', 'Europe/Madrid')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- SCHEMA: crm
-- Pipeline comercial — migrado desde public (tablas actuales)
-- ============================================================

CREATE TABLE IF NOT EXISTS crm.accounts (
  id            SERIAL PRIMARY KEY,
  org_id        INTEGER NOT NULL REFERENCES core.organizations(id) DEFAULT 1,
  name          TEXT NOT NULL,
  type          TEXT CHECK (type IN ('local','hotel')),
  plan          TEXT CHECK (plan IN ('premium_local','pro_bi','hotel_analytics','hotel_elite')),
  stage         TEXT NOT NULL DEFAULT 'new',
  zone          TEXT,
  assigned_to   INTEGER REFERENCES core.users(id) ON DELETE SET NULL,
  mrr           NUMERIC DEFAULT 0,
  pulse_score   INTEGER,
  contact_name  TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  address       TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm.leads (
  id           SERIAL PRIMARY KEY,
  org_id       INTEGER NOT NULL REFERENCES core.organizations(id) DEFAULT 1,
  name         TEXT NOT NULL,
  type         TEXT CHECK (type IN ('local','hotel')),
  zone         TEXT,
  source       TEXT,
  stage        TEXT NOT NULL DEFAULT 'new',
  phone        TEXT,
  email        TEXT,
  assigned_to  INTEGER REFERENCES core.users(id) ON DELETE SET NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm.tasks (
  id           SERIAL PRIMARY KEY,
  org_id       INTEGER NOT NULL REFERENCES core.organizations(id) DEFAULT 1,
  title        TEXT NOT NULL,
  due_at       TIMESTAMPTZ,
  priority     TEXT DEFAULT 'medium' CHECK (priority IN ('urgent','high','medium','low')),
  assigned_to  INTEGER REFERENCES core.users(id) ON DELETE SET NULL,
  account_id   INTEGER REFERENCES crm.accounts(id) ON DELETE SET NULL,
  done         BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm.activities (
  id           SERIAL PRIMARY KEY,
  org_id       INTEGER NOT NULL REFERENCES core.organizations(id) DEFAULT 1,
  type         TEXT CHECK (type IN ('call','email','visit','note','system')),
  description  TEXT NOT NULL,
  agent_id     INTEGER REFERENCES core.users(id) ON DELETE SET NULL,
  account_id   INTEGER REFERENCES crm.accounts(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SCHEMA: ops
-- Gestión interna OmniPulse OÜ — OPS v2
-- ============================================================

-- Trabajadores / empleados
CREATE TABLE IF NOT EXISTS ops.workers (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  org_id     INTEGER NOT NULL REFERENCES core.organizations(id) DEFAULT 1,
  department TEXT DEFAULT 'operations',
  role       TEXT DEFAULT 'worker' CHECK (role IN ('admin','worker','freelance')),
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, org_id)
);

-- Clientes de facturación (pueden estar vinculados a una cuenta CRM o a una org)
CREATE TABLE IF NOT EXISTS ops.clientes (
  id              SERIAL PRIMARY KEY,
  org_id          INTEGER NOT NULL REFERENCES core.organizations(id) DEFAULT 1,
  crm_account_id  INTEGER REFERENCES crm.accounts(id) ON DELETE SET NULL,
  -- Si el cliente ES otra organización del ecosistema (ej: cliente Helsinki)
  client_org_id   INTEGER REFERENCES core.organizations(id) ON DELETE SET NULL,
  nombre          TEXT NOT NULL,
  contacto        TEXT,
  vat_number      TEXT,
  tipo_cliente    TEXT DEFAULT 'b2b' CHECK (tipo_cliente IN ('b2b','b2c')),
  pais            TEXT DEFAULT 'Estonia',
  email           TEXT,
  telefono        TEXT,
  direccion       TEXT,
  codigo_postal   TEXT,
  ciudad          TEXT,
  notas           TEXT,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Contador de facturas por año (reemplaza la tabla config de Supabase)
CREATE TABLE IF NOT EXISTS ops.invoice_counter (
  year     INTEGER PRIMARY KEY,
  counter  INTEGER DEFAULT 0
);

INSERT INTO ops.invoice_counter (year, counter)
VALUES (EXTRACT(YEAR FROM NOW())::INTEGER, 0)
ON CONFLICT (year) DO NOTHING;

-- Facturas con IVA EU correcto
CREATE TABLE IF NOT EXISTS ops.facturas (
  id                    SERIAL PRIMARY KEY,
  org_id                INTEGER NOT NULL REFERENCES core.organizations(id) DEFAULT 1,
  numero                TEXT UNIQUE,
  cliente_id            INTEGER REFERENCES ops.clientes(id) ON DELETE SET NULL,
  fecha_emision         DATE,
  fecha_vencimiento     DATE,
  estado                TEXT DEFAULT 'borrador'
                        CHECK (estado IN ('borrador','enviada','cobrada','vencida')),
  tipo                  TEXT DEFAULT 'normal' CHECK (tipo IN ('normal','recurrente')),
  intervalo_recurrencia TEXT CHECK (intervalo_recurrencia IN ('mensual','trimestral')),
  metodo_pago           TEXT DEFAULT 'Transferencia',
  -- IVA / VAT EU
  tipo_iva              TEXT DEFAULT 'normal'
                        CHECK (tipo_iva IN ('normal','intracomunitario','exento')),
  -- normal: IVA del país vendedor (22% Estonia doméstico, 21% España, etc.)
  -- intracomunitario: 0% + nota legal obligatoria (B2B entre países EU)
  -- exento: 0% sin nota (casos específicos legales)
  iva_rate              NUMERIC DEFAULT 0,
  subtotal              NUMERIC DEFAULT 0,
  iva_importe           NUMERIC DEFAULT 0,
  total                 NUMERIC DEFAULT 0,
  notas                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Líneas de factura
CREATE TABLE IF NOT EXISTS ops.factura_lineas (
  id              SERIAL PRIMARY KEY,
  factura_id      INTEGER NOT NULL REFERENCES ops.facturas(id) ON DELETE CASCADE,
  descripcion     TEXT,
  cantidad        NUMERIC DEFAULT 1,
  precio_unitario NUMERIC DEFAULT 0,
  importe         NUMERIC DEFAULT 0,
  orden           INTEGER DEFAULT 0
);

-- Movimientos de caja
CREATE TABLE IF NOT EXISTS ops.caja_movimientos (
  id          SERIAL PRIMARY KEY,
  org_id      INTEGER NOT NULL REFERENCES core.organizations(id) DEFAULT 1,
  tipo        TEXT NOT NULL CHECK (tipo IN ('ingreso','gasto')),
  concepto    TEXT NOT NULL,
  importe     NUMERIC DEFAULT 0,
  tipo_iva    TEXT DEFAULT 'normal',
  iva_rate    NUMERIC DEFAULT 0,
  iva_importe NUMERIC DEFAULT 0,
  fecha       DATE,
  categoria   TEXT,
  cliente_id  INTEGER REFERENCES ops.clientes(id) ON DELETE SET NULL,
  factura_id  INTEGER REFERENCES ops.facturas(id) ON DELETE SET NULL,
  recurrente  BOOLEAN DEFAULT false,
  intervalo   TEXT,
  notas       TEXT,
  recibo_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Jornadas / control horario
CREATE TABLE IF NOT EXISTS ops.jornadas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id         INTEGER REFERENCES ops.workers(id) ON DELETE SET NULL,
  user_id           INTEGER NOT NULL REFERENCES core.users(id),
  org_id            INTEGER NOT NULL REFERENCES core.organizations(id) DEFAULT 1,
  fecha             DATE NOT NULL,
  entrada           TIMESTAMPTZ,
  salida            TIMESTAMPTZ,
  total_minutos     INTEGER,
  lat_entrada       FLOAT,
  lng_entrada       FLOAT,
  direccion_entrada TEXT,
  lat_salida        FLOAT,
  lng_salida        FLOAT,
  direccion_salida  TEXT,
  tipo              TEXT DEFAULT 'oficina' CHECK (tipo IN ('oficina','remoto','cliente')),
  notas             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- RPC: marcar facturas vencidas
CREATE OR REPLACE FUNCTION ops.check_vencidas()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE ops.facturas
  SET estado = 'vencida'
  WHERE estado = 'enviada'
    AND fecha_vencimiento IS NOT NULL
    AND fecha_vencimiento < CURRENT_DATE;
$$;

-- RPC: generar siguiente número de factura (atómico, sin race condition)
CREATE OR REPLACE FUNCTION ops.next_invoice_number()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  yr  INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
  n   INTEGER;
BEGIN
  INSERT INTO ops.invoice_counter (year, counter)
  VALUES (yr, 1)
  ON CONFLICT (year) DO UPDATE
    SET counter = ops.invoice_counter.counter + 1
  RETURNING counter INTO n;
  RETURN yr::TEXT || '-' || LPAD(n::TEXT, 3, '0');
END;
$$;

-- ============================================================
-- SCHEMA: pwa
-- Datos de la PWA PulseCosta — multi-tenant por org
-- ============================================================

CREATE TABLE IF NOT EXISTS pwa.zones (
  id         SERIAL PRIMARY KEY,
  org_id     INTEGER NOT NULL REFERENCES core.organizations(id),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  polygon    JSONB,               -- GeoJSON polygon
  city       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

CREATE TABLE IF NOT EXISTS pwa.venues (
  id               SERIAL PRIMARY KEY,
  org_id           INTEGER NOT NULL REFERENCES core.organizations(id),
  crm_account_id   INTEGER REFERENCES crm.accounts(id) ON DELETE SET NULL,
  zone_id          INTEGER REFERENCES pwa.zones(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  slug             TEXT,
  type             TEXT,  -- 'bar','restaurant','hotel','club','beach_club'
  address          TEXT,
  lat              FLOAT,
  lng              FLOAT,
  phone            TEXT,
  email            TEXT,
  website          TEXT,
  instagram        TEXT,
  cover_image_url  TEXT,  -- validada por control de calidad
  logo_url         TEXT,
  plan             TEXT,
  active           BOOLEAN DEFAULT true,
  verified         BOOLEAN DEFAULT false,
  pin_hash         TEXT,  -- SHA-256 para validación QR hotel
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

-- Pulse scores — TimescaleDB hypertable (series temporales)
CREATE TABLE IF NOT EXISTS pwa.pulse_scores (
  time                  TIMESTAMPTZ NOT NULL,
  venue_id              INTEGER NOT NULL REFERENCES pwa.venues(id) ON DELETE CASCADE,
  org_id                INTEGER NOT NULL REFERENCES core.organizations(id),
  score                 SMALLINT,           -- 0-100
  density_component     FLOAT,
  approach_component    FLOAT,
  affinity_component    FLOAT,
  anonymous_user_count  INTEGER DEFAULT 0,
  PRIMARY KEY (time, venue_id)
);

-- Convertir en hypertable de TimescaleDB
SELECT create_hypertable('pwa.pulse_scores', 'time', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS pwa.events (
  id          SERIAL PRIMARY KEY,
  org_id      INTEGER NOT NULL REFERENCES core.organizations(id),
  venue_id    INTEGER REFERENCES pwa.venues(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  type        TEXT,  -- 'music','sport','gastro','culture','other'
  date_start  TIMESTAMPTZ,
  date_end    TIMESTAMPTZ,
  image_url   TEXT,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Sesiones QR de hotel (para atribución)
CREATE TABLE IF NOT EXISTS pwa.hotel_qr_sessions (
  id              SERIAL PRIMARY KEY,
  org_id          INTEGER NOT NULL REFERENCES core.organizations(id),
  venue_id        INTEGER REFERENCES pwa.venues(id) ON DELETE SET NULL,
  room_number     TEXT,
  qr_token_hash   TEXT UNIQUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,
  validated       BOOLEAN DEFAULT false,
  validated_at    TIMESTAMPTZ
);

-- ============================================================
-- SCHEMA: analytics
-- Pulse City + OmniPulse predictivo (estructura preparada)
-- ============================================================

-- Datos oficiales importados (INE, Turespaña, Junta, VisitFinland, etc.)
CREATE TABLE IF NOT EXISTS analytics.city_metrics (
  id           BIGSERIAL PRIMARY KEY,
  org_id       INTEGER NOT NULL REFERENCES core.organizations(id),
  source       TEXT NOT NULL,  -- 'ine','turespana','junta','diputacion_malaga','visitfinland'
  metric_type  TEXT NOT NULL,  -- 'hotel_occupancy','cruise_arrivals','event_attendance','transport'
  date         DATE NOT NULL,
  value        NUMERIC,
  metadata     JSONB,
  imported_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Predicciones del modelo OmniPulse
CREATE TABLE IF NOT EXISTS analytics.predictions (
  id               BIGSERIAL PRIMARY KEY,
  org_id           INTEGER NOT NULL REFERENCES core.organizations(id),
  zone_id          INTEGER REFERENCES pwa.zones(id) ON DELETE SET NULL,
  prediction_date  DATE NOT NULL,
  horizon_days     INTEGER,       -- 30 o 60
  predicted_flow   INTEGER,
  confidence       FLOAT,         -- 0.0 - 1.0
  model_version    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Benchmarks cross-ciudad (comparativa Costa del Sol vs Helsinki)
CREATE TABLE IF NOT EXISTS analytics.city_benchmarks (
  id         BIGSERIAL PRIMARY KEY,
  metric     TEXT NOT NULL,
  org_id_a   INTEGER REFERENCES core.organizations(id),
  org_id_b   INTEGER REFERENCES core.organizations(id),
  date       DATE,
  value_a    NUMERIC,
  value_b    NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES — rendimiento en consultas frecuentes
-- ============================================================

-- core
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON core.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_org  ON core.user_roles(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_time  ON core.audit_log(created_at DESC);

-- crm
CREATE INDEX IF NOT EXISTS idx_crm_accounts_org   ON crm.accounts(org_id);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_stage ON crm.accounts(stage);
CREATE INDEX IF NOT EXISTS idx_crm_leads_org      ON crm.leads(org_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assigned ON crm.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_activities_acc ON crm.activities(account_id);

-- ops
CREATE INDEX IF NOT EXISTS idx_ops_facturas_cliente  ON ops.facturas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ops_facturas_estado   ON ops.facturas(estado);
CREATE INDEX IF NOT EXISTS idx_ops_jornadas_user     ON ops.jornadas(user_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ops_caja_fecha        ON ops.caja_movimientos(fecha DESC);

-- pwa
CREATE INDEX IF NOT EXISTS idx_pwa_venues_org    ON pwa.venues(org_id);
CREATE INDEX IF NOT EXISTS idx_pwa_venues_zone   ON pwa.venues(zone_id);
CREATE INDEX IF NOT EXISTS idx_pwa_events_org    ON pwa.events(org_id, date_start);
CREATE INDEX IF NOT EXISTS idx_pulse_venue_time  ON pwa.pulse_scores(venue_id, time DESC);

-- analytics
CREATE INDEX IF NOT EXISTS idx_city_metrics_org  ON analytics.city_metrics(org_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_org   ON analytics.predictions(org_id, prediction_date);

-- ============================================================
-- FIN
-- Después de ejecutar este schema:
-- 1. Migrar datos existentes de public.* a crm.* y pwa.*
-- 2. Crear usuarios en core.users y asignar roles
-- 3. Actualizar crm-api para usar los nuevos schemas
-- 4. Construir /ops/* endpoints en crm-api
-- ============================================================
