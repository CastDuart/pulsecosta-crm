-- PulseCosta — Agentes de campo iniciales
-- Ejecutar: psql -U pulsecosta -d pulsecosta_db -f 002_add_field_agents.sql
-- NOTA SEGURIDAD: nunca poner contraseñas en claro aquí. Los hashes bcrypt de
-- abajo corresponden a cuentas legacy (ya dadas de baja); rotar si se reactivan.
-- Pendiente: purgar del historial git (git filter-repo) los valores en claro
-- que estuvieron en este comentario.

INSERT INTO core.users (email, password_hash, name)
VALUES
  ('sergio@pulsecosta.es', '$2b$12$CY3aEZBjVhzSfVOLVRSK6u.Jk9FS3msIydnkkmTP1aUfjUyQa7Pj.', 'Sergio'),
  ('jota@pulsecosta.es',   '$2b$12$Vjg0KZAdgxYqF3P/xP.0C.6aFMWKPc/N4AP5u7IAoglxki97S81va', 'Jota')
ON CONFLICT (email) DO NOTHING;

INSERT INTO core.user_roles (user_id, org_id, role)
SELECT id, 1, 'field_agent' FROM core.users WHERE email = 'sergio@pulsecosta.es'
ON CONFLICT DO NOTHING;

INSERT INTO core.user_roles (user_id, org_id, role)
SELECT id, 1, 'field_agent' FROM core.users WHERE email = 'jota@pulsecosta.es'
ON CONFLICT DO NOTHING;

-- Verificar
SELECT u.id, u.email, u.name, u.initials, r.role
FROM core.users u
JOIN core.user_roles r ON r.user_id = u.id
WHERE u.email IN ('sergio@pulsecosta.es', 'jota@pulsecosta.es');
