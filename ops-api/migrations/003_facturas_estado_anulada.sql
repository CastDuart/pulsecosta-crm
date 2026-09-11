-- Estado 'anulada' para facturas (la UI ya lo ofrece; el CHECK solo admitía borrador/enviada/cobrada/vencida).
-- Aplicar: sudo docker exec -i postgres psql -U pulsecosta -d pulsecosta_db < 003_facturas_estado_anulada.sql
BEGIN;
ALTER TABLE ops.facturas DROP CONSTRAINT IF EXISTS facturas_estado_check;
ALTER TABLE ops.facturas ADD CONSTRAINT facturas_estado_check
  CHECK (estado = ANY (ARRAY['borrador','enviada','cobrada','vencida','anulada']));
COMMIT;
