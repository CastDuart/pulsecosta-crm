-- Jurisdicción de IVA en facturas: estonio / español / europeo (intracomunitario) / exento.
-- Novitum OÜ (Estonia) factura con distintos regímenes según el cliente.
-- Aplicar: psql -U pulsecosta -d pulsecosta_db -f 001_add_iva_jurisdiccion.sql

ALTER TABLE ops.facturas
  ADD COLUMN IF NOT EXISTS iva_jurisdiccion text NOT NULL DEFAULT 'estonia'
  CHECK (iva_jurisdiccion IN ('estonia','spain','eu','exento'));

-- Backfill de facturas existentes según régimen/tasa.
UPDATE ops.facturas SET iva_jurisdiccion =
  CASE
    WHEN tipo_iva = 'intracomunitario' THEN 'eu'
    WHEN tipo_iva = 'exento'           THEN 'exento'
    WHEN iva_rate IN (21, 10, 4)       THEN 'spain'
    ELSE 'estonia'
  END;
