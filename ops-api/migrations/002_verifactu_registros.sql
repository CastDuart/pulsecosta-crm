-- Verifactu (AEAT) — registros de facturación encadenados por huella SHA-256.
-- BASE apagada: solo se generan a demanda para facturas con IVA español.
-- No es cumplimiento activo hasta alta AEAT + declaración responsable.
-- Aplicar: psql -U pulsecosta -d pulsecosta_db -f 002_verifactu_registros.sql

CREATE TABLE IF NOT EXISTS ops.verifactu_registros (
  id               SERIAL PRIMARY KEY,
  org_id           INTEGER NOT NULL DEFAULT 1,
  factura_id       INTEGER NOT NULL REFERENCES ops.facturas(id) ON DELETE CASCADE,
  nif_emisor       TEXT NOT NULL,
  num_serie        TEXT NOT NULL,
  fecha_expedicion TEXT NOT NULL,                 -- DD-MM-AAAA
  tipo_factura     TEXT NOT NULL DEFAULT 'F1',
  cuota_total      NUMERIC NOT NULL DEFAULT 0,
  importe_total    NUMERIC NOT NULL DEFAULT 0,
  huella_anterior  TEXT NOT NULL DEFAULT '',      -- encadenamiento
  huella           TEXT NOT NULL,                 -- SHA-256 hex mayúsculas (64)
  cadena_entrada   TEXT NOT NULL,                 -- auditoría: cadena hasheada
  fecha_hora_gen   TEXT NOT NULL,                 -- ISO8601 + huso
  modo             TEXT NOT NULL DEFAULT 'no_verifactu' CHECK (modo IN ('verifactu','no_verifactu')),
  qr_url           TEXT NOT NULL,
  certificado      BOOLEAN NOT NULL DEFAULT false, -- false = pruebas / no activado
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS verifactu_factura_idx ON ops.verifactu_registros(factura_id);
CREATE INDEX IF NOT EXISTS verifactu_org_id_idx  ON ops.verifactu_registros(org_id, id);
