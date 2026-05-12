-- ============================================================
-- OmniPulse — Seed inicial v1.0
-- Ejecutar DESPUÉS de omnipulse-schema.sql
-- ============================================================

-- ── Organización inicial: Costa del Sol ─────────────────────
-- Ya insertada en el schema con DEFAULT, verificamos
INSERT INTO core.organizations (id, name, slug, country, timezone)
VALUES (1, 'PulseCosta Costa del Sol', 'costa-del-sol', 'ES', 'Europe/Madrid')
ON CONFLICT (id) DO NOTHING;

SELECT setval('core.organizations_id_seq', 1);

-- ── Migrar usuarios desde public.crm_users ──────────────────
INSERT INTO core.users (id, email, password_hash, name, active, created_at)
SELECT id, email, password_hash, name, active, created_at
FROM public.crm_users
ON CONFLICT (email) DO NOTHING;

-- Ajustar la secuencia para que el próximo usuario tenga id=3
SELECT setval('core.users_id_seq', (SELECT MAX(id) FROM core.users));

-- ── Roles ────────────────────────────────────────────────────
-- Cipriano: super_admin + finance_admin (acceso total + OPS)
INSERT INTO core.user_roles (user_id, org_id, role)
VALUES
  (1, 1, 'super_admin'),
  (1, 1, 'finance_admin')
ON CONFLICT (user_id, org_id, role) DO NOTHING;

-- Heidi: sales_admin + ops_admin (COO)
INSERT INTO core.user_roles (user_id, org_id, role)
VALUES
  (2, 1, 'sales_admin'),
  (2, 1, 'ops_admin')
ON CONFLICT (user_id, org_id, role) DO NOTHING;

-- ── Workers (para control horario OPS) ───────────────────────
INSERT INTO ops.workers (user_id, org_id, department, role)
VALUES
  (1, 1, 'management', 'admin'),
  (2, 1, 'management', 'admin')
ON CONFLICT (user_id, org_id) DO NOTHING;

-- ── Verificación final ───────────────────────────────────────
SELECT
  u.id,
  u.email,
  u.name,
  u.initials,
  array_agg(r.role ORDER BY r.role) AS roles
FROM core.users u
JOIN core.user_roles r ON r.user_id = u.id
GROUP BY u.id, u.email, u.name, u.initials
ORDER BY u.id;
