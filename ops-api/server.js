require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { askLLM } = require('./llmClient');
const { askLegalKB, detectLegal } = require('./legalKb');

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

function gemini() {
  if (!genAI) throw new Error('GEMINI_API_KEY no configurada');
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
}

const app        = express();
const PORT       = process.env.PORT || 3011;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('FATAL: JWT_SECRET no configurado'); process.exit(1); }

const pool = new Pool({
  host:     process.env.DB_HOST     || 'postgres',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'pulsecosta_db',
  user:     process.env.DB_USER     || 'pulsecosta',
  password: process.env.DB_PASSWORD,
});

const _allowedOrigins = (process.env.CORS_ORIGIN || 'https://crm.pulsecosta.es,https://ops.pulsecosta.es,https://field.pulsecosta.es,https://app.pulsecosta.es').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    const o = origin ? origin.replace(/\.$/, '') : origin;
    return (!o || _allowedOrigins.includes(o)) ? cb(null, true) : cb(new Error('CORS not allowed'));
  },
  credentials: true,
}));
app.use(helmet());
// Detrás de nginx: confía en 1 proxy para la IP real (rate-limit por IP).
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));   // límite de cuerpo: evita payloads gigantes

// Rate limit global (anti-abuso).
app.use(rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));

// ── Auth middleware (verify-only; login vive en crm-api) ────
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(h.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token invalido' }); }
}

// Error 500 genérico: loguea el detalle en servidor, NO lo filtra al cliente.
function srvErr(res, err) {
  console.error('[ops-api]', err?.stack || err?.message || err);
  res.status(500).json({ error: 'Error interno del servidor' });
}

// ── OPS: WORKERS ─────────────────────────────────────────────
app.get('/api/ops/workers', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT w.*, u.email, u.name, u.initials, u.last_login,
              array_agg(r.role) FILTER (WHERE r.role IS NOT NULL) AS roles
       FROM ops.workers w
       JOIN core.users u       ON u.id = w.user_id
       LEFT JOIN core.user_roles r ON r.user_id = w.user_id AND r.org_id = w.org_id
       WHERE w.org_id = $1
       GROUP BY w.id, u.email, u.name, u.initials, u.last_login
       ORDER BY u.name`,
      [req.user.org_id || 1]
    );
    res.json(rows);
  } catch (err) { srvErr(res, err); }
});

app.post('/api/ops/workers', auth, async (req, res) => {
  // Crear usuarios + asignar roles es privilegiado: solo admins (evita escalada).
  const ROLES_ADMIN = ['super_admin', 'ops_admin', 'admin'];
  if (!req.user.roles?.some(r => ROLES_ADMIN.includes(r)))
    return res.status(403).json({ error: 'Forbidden' });
  const { email, name, password, department, role } = req.body;
  if (!email || !name || !password) return res.status(400).json({ error: 'email, name y password son obligatorios' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows: [newUser] } = await pool.query(
      `INSERT INTO core.users (email, password_hash, name) VALUES ($1,$2,$3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [email.toLowerCase(), hash, name]
    );
    await pool.query(
      `INSERT INTO core.user_roles (user_id, org_id, role)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [newUser.id, req.user.org_id||1, role||'worker']
    );
    await pool.query(
      `INSERT INTO ops.workers (user_id, org_id, department, role)
       VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, org_id) DO UPDATE SET department=EXCLUDED.department, role=EXCLUDED.role`,
      [newUser.id, req.user.org_id||1, department||'operations', role||'worker']
    );
    res.status(201).json({ message: 'Worker creado ✓', user_id: newUser.id });
  } catch (err) { srvErr(res, err); }
});

// ── OPS: CLIENTES ────────────────────────────────────────────
app.get('/api/ops/clientes', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, a.name AS crm_account_name
       FROM ops.clientes c
       LEFT JOIN crm.accounts a ON a.id = c.crm_account_id
       WHERE c.org_id = $1 ORDER BY c.nombre`,
      [req.user.org_id || 1]
    );
    res.json(rows);
  } catch (err) { srvErr(res, err); }
});

app.post('/api/ops/clientes', auth, async (req, res) => {
  const { nombre, contacto, vat_number, tipo_cliente, pais, email,
          telefono, direccion, codigo_postal, ciudad, notas, crm_account_id } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es obligatorio' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO ops.clientes
         (org_id,nombre,contacto,vat_number,tipo_cliente,pais,email,
          telefono,direccion,codigo_postal,ciudad,notas,crm_account_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.user.org_id||1, nombre, contacto, vat_number, tipo_cliente||'b2b',
       pais||'Estonia', email, telefono, direccion, codigo_postal, ciudad, notas,
       crm_account_id||null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { srvErr(res, err); }
});

app.put('/api/ops/clientes/:id', auth, async (req, res) => {
  const allowed = ['nombre','contacto','vat_number','tipo_cliente','pais',
                   'email','telefono','direccion','codigo_postal','ciudad','notas','activo','crm_account_id'];
  const updates = [], p = [];
  allowed.forEach(f => {
    if (req.body[f] !== undefined) { p.push(req.body[f]); updates.push(`${f}=$${p.length}`); }
  });
  if (!updates.length) return res.status(400).json({ error: 'Nada que actualizar' });
  const idParam = p.push(req.params.id);
  const orgParam = p.push(req.user.org_id || 1);
  try {
    const { rows } = await pool.query(
      `UPDATE ops.clientes SET ${updates.join(',')}
       WHERE id=$${idParam} AND org_id=$${orgParam} RETURNING *`, p
    );
    res.json(rows[0] || null);
  } catch (err) { srvErr(res, err); }
});

// ── OPS: FACTURAS ────────────────────────────────────────────
app.get('/api/ops/facturas', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*, c.nombre AS cliente_nombre, c.vat_number, c.pais, c.tipo_cliente, c.email AS cliente_email
       FROM ops.facturas f
       LEFT JOIN ops.clientes c ON c.id = f.cliente_id
       WHERE f.org_id = $1 ORDER BY f.created_at DESC`,
      [req.user.org_id || 1]
    );
    res.json(rows);
  } catch (err) { srvErr(res, err); }
});

app.get('/api/ops/facturas/:id/lineas', auth, async (req, res) => {
  try {
    // Scope por tenant: solo líneas de facturas de la propia organización (evita IDOR).
    const { rows } = await pool.query(
      `SELECT l.* FROM ops.factura_lineas l
       JOIN ops.facturas f ON f.id = l.factura_id
       WHERE l.factura_id = $1 AND f.org_id = $2 ORDER BY l.orden`,
      [req.params.id, req.user.org_id || 1]
    );
    res.json(rows);
  } catch (err) { srvErr(res, err); }
});

app.post('/api/ops/facturas', auth, async (req, res) => {
  const { cliente_id, fecha_emision, fecha_vencimiento, metodo_pago,
          tipo_iva, iva_rate, subtotal, iva_importe, total,
          tipo, intervalo_recurrencia, notas, lineas } = req.body;
  if (!cliente_id) return res.status(400).json({ error: 'cliente_id es obligatorio' });
  const client = pool;
  try {
    const { rows: [cli] } = await client.query(
      'SELECT id FROM ops.clientes WHERE id = $1 AND org_id = $2',
      [cliente_id, req.user.org_id || 1]
    );
    if (!cli) return res.status(400).json({ error: 'Cliente no encontrado en esta organización' });
    await client.query('BEGIN');
    const numero = (await client.query('SELECT ops.next_invoice_number() AS n')).rows[0].n;
    const { rows: [factura] } = await client.query(
      `INSERT INTO ops.facturas
         (org_id,numero,cliente_id,fecha_emision,fecha_vencimiento,metodo_pago,
          tipo_iva,iva_rate,subtotal,iva_importe,total,tipo,intervalo_recurrencia,notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [req.user.org_id||1, numero, cliente_id, fecha_emision,
       fecha_vencimiento||null, metodo_pago||'Transferencia',
       tipo_iva||'normal', iva_rate||0, subtotal||0, iva_importe||0, total||0,
       tipo||'normal', intervalo_recurrencia||null, notas||null]
    );
    if (lineas?.length) {
      for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i];
        await client.query(
          `INSERT INTO ops.factura_lineas (factura_id,descripcion,cantidad,precio_unitario,importe,orden)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [factura.id, l.descripcion, l.cantidad||1, l.precio_unitario||0, l.importe||0, i]
        );
      }
    }
    await client.query('COMMIT');
    res.status(201).json(factura);
  } catch (err) { await client.query('ROLLBACK'); srvErr(res, err); }
});

app.put('/api/ops/facturas/:id', auth, async (req, res) => {
  // Enum canónico REAL de la BD (ops.facturas.estado CHECK): español.
  const VALID_ESTADOS = ['borrador','enviada','cobrada','vencida'];
  if (req.body.estado !== undefined && !VALID_ESTADOS.includes(req.body.estado))
    return res.status(400).json({ error: `Estado inválido. Valores permitidos: ${VALID_ESTADOS.join(', ')}` });
  const allowed = ['estado','fecha_vencimiento','metodo_pago','tipo_iva',
                   'iva_rate','subtotal','iva_importe','total','notas'];
  const updates = [], p = [];
  allowed.forEach(f => {
    if (req.body[f] !== undefined) { p.push(req.body[f]); updates.push(`${f}=$${p.length}`); }
  });
  if (!updates.length) return res.status(400).json({ error: 'Nada que actualizar' });
  const idParam = p.push(req.params.id);            // org_id/id como parámetros bind
  const orgParam = p.push(req.user.org_id || 1);
  try {
    const { rows } = await pool.query(
      `UPDATE ops.facturas SET ${updates.join(',')}
       WHERE id=$${idParam} AND org_id=$${orgParam} RETURNING *`, p
    );
    res.json(rows[0] || null);
  } catch (err) { srvErr(res, err); }
});

// ── OPS: CAJA ────────────────────────────────────────────────
app.get('/api/ops/caja', auth, async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    let q = `SELECT m.*, c.nombre AS cliente_nombre
             FROM ops.caja_movimientos m
             LEFT JOIN ops.clientes c ON c.id = m.cliente_id
             WHERE m.org_id = $1`;
    const p = [req.user.org_id || 1];
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (desde) {
      if (!dateRe.test(desde)) return res.status(400).json({ error: 'desde debe ser YYYY-MM-DD' });
      p.push(desde); q += ` AND m.fecha >= $${p.length}`;
    }
    if (hasta) {
      if (!dateRe.test(hasta)) return res.status(400).json({ error: 'hasta debe ser YYYY-MM-DD' });
      p.push(hasta); q += ` AND m.fecha <= $${p.length}`;
    }
    q += ' ORDER BY m.fecha DESC, m.created_at DESC';
    const { rows } = await pool.query(q, p);
    res.json(rows);
  } catch (err) { srvErr(res, err); }
});

app.post('/api/ops/caja', auth, async (req, res) => {
  const { tipo, concepto, importe, tipo_iva, iva_rate, iva_importe,
          fecha, categoria, cliente_id, factura_id, recurrente, intervalo, notas } = req.body;
  if (!tipo || !concepto) return res.status(400).json({ error: 'tipo y concepto son obligatorios' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO ops.caja_movimientos
         (org_id,tipo,concepto,importe,tipo_iva,iva_rate,iva_importe,
          fecha,categoria,cliente_id,factura_id,recurrente,intervalo,notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [req.user.org_id||1, tipo, concepto, importe||0, tipo_iva||'normal',
       iva_rate||0, iva_importe||0, fecha, categoria,
       cliente_id||null, factura_id||null, recurrente||false, intervalo||null, notas||null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { srvErr(res, err); }
});

// ── OPS: JORNADAS ────────────────────────────────────────────
app.get('/api/ops/jornadas', auth, async (req, res) => {
  try {
    const orgId = req.user.org_id || 1;
    let q = `SELECT j.*, u.name AS user_name, u.email AS user_email
             FROM ops.jornadas j
             JOIN core.users u ON u.id = j.user_id
             WHERE j.org_id = $1`;
    const p = [orgId];
    if (!req.user.roles?.includes('super_admin') && !req.user.roles?.includes('ops_admin')) {
      p.push(req.user.id); q += ` AND j.user_id = $${p.length}`;
    }
    q += ' ORDER BY j.fecha DESC, j.entrada DESC';
    const { rows } = await pool.query(q, p);
    res.json(rows);
  } catch (err) { srvErr(res, err); }
});

app.post('/api/ops/jornadas/entrada', auth, async (req, res) => {
  const { lat, lng, direccion } = req.body;
  try {
    const today = new Date().toISOString().split('T')[0];
    const { rows: open } = await pool.query(
      `SELECT id FROM ops.jornadas WHERE user_id = $1 AND fecha = $2 AND salida IS NULL`,
      [req.user.id, today]
    );
    if (open.length) return res.status(409).json({ error: 'Ya hay una jornada abierta hoy' });

    const { rows: [jornada] } = await pool.query(
      `INSERT INTO ops.jornadas
         (user_id,org_id,fecha,entrada,lat_entrada,lng_entrada,direccion_entrada)
       VALUES ($1,$2,$3,NOW(),$4,$5,$6) RETURNING *`,
      [req.user.id, req.user.org_id||1, today, lat||null, lng||null, direccion||null]
    );
    res.status(201).json(jornada);
  } catch (err) { srvErr(res, err); }
});

app.put('/api/ops/jornadas/:id/salida', auth, async (req, res) => {
  const { lat, lng, direccion } = req.body;
  try {
    const { rows: [jornada] } = await pool.query(
      `UPDATE ops.jornadas
       SET salida = NOW(),
           total_minutos = EXTRACT(EPOCH FROM (NOW() - entrada))::int / 60,
           lat_salida = $1, lng_salida = $2, direccion_salida = $3
       WHERE id = $4 AND user_id = $5 AND salida IS NULL
       RETURNING *`,
      [lat||null, lng||null, direccion||null, req.params.id, req.user.id]
    );
    if (!jornada) return res.status(404).json({ error: 'Jornada no encontrada o ya cerrada' });
    res.json(jornada);
  } catch (err) { srvErr(res, err); }
});

app.put('/api/ops/jornadas/:id', auth, async (req, res) => {
  const allowed = ['tipo','notas','direccion_entrada','direccion_salida'];
  const updates = [], p = [];
  allowed.forEach(f => {
    if (req.body[f] !== undefined) { p.push(req.body[f]); updates.push(`${f}=$${p.length}`); }
  });
  if (!updates.length) return res.status(400).json({ error: 'Nada que actualizar' });
  p.push(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE ops.jornadas SET ${updates.join(',')}
       WHERE id=$${p.length} AND user_id=${req.user.id} RETURNING *`, p
    );
    res.json(rows[0] || null);
  } catch (err) { srvErr(res, err); }
});

// ── OPS: VISITAS ─────────────────────────────────────────────
async function ensureVisitasTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ops.visitas (
      id                 SERIAL PRIMARY KEY,
      org_id             INTEGER NOT NULL DEFAULT 1,
      venue              TEXT NOT NULL,
      ciudad             TEXT,
      direccion          TEXT,
      contacto           TEXT,
      telefono           TEXT,
      email              TEXT,
      vat_number         TEXT,
      fecha              DATE NOT NULL DEFAULT CURRENT_DATE,
      plan               TEXT,
      estado             TEXT NOT NULL DEFAULT 'pending'
                           CHECK (estado IN ('pending','follow_up','closed','lost')),
      prioridad          TEXT DEFAULT 'medium'
                           CHECK (prioridad IN ('low','medium','high')),
      propuesta_enviada  BOOLEAN DEFAULT false,
      fecha_seguimiento  DATE,
      proxima_accion     TEXT,
      notas              TEXT,
      cliente_id         INTEGER REFERENCES ops.clientes(id) ON DELETE SET NULL,
      factura_id         INTEGER REFERENCES ops.facturas(id) ON DELETE SET NULL,
      venue_id           UUID    REFERENCES public.venues(id) ON DELETE SET NULL,
      created_by         INTEGER REFERENCES core.users(id),
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE ops.visitas ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS visitas_org_idx      ON ops.visitas(org_id);
    CREATE INDEX IF NOT EXISTS visitas_estado_idx   ON ops.visitas(estado);
    CREATE INDEX IF NOT EXISTS visitas_venue_id_idx ON ops.visitas(venue_id);
  `);
}

app.get('/api/ops/visitas', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT v.*, c.nombre AS cliente_nombre,
              pv.name AS venue_public_name, pv.category AS venue_category,
              pv.lat AS venue_lat, pv.lng AS venue_lng
       FROM ops.visitas v
       LEFT JOIN ops.clientes c   ON c.id  = v.cliente_id
       LEFT JOIN public.venues pv ON pv.id = v.venue_id
       WHERE v.org_id = $1 ORDER BY v.fecha DESC, v.created_at DESC`,
      [req.user.org_id || 1]
    );
    res.json(rows);
  } catch (err) { srvErr(res, err); }
});

app.post('/api/ops/visitas', auth, async (req, res) => {
  const { venue, ciudad, direccion, contacto, telefono, email, vat_number,
          fecha, plan, estado, prioridad, propuesta_enviada,
          fecha_seguimiento, proxima_accion, notas, cliente_id, venue_id } = req.body;
  if (!venue) return res.status(400).json({ error: 'venue es obligatorio' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO ops.visitas
         (org_id,venue,ciudad,direccion,contacto,telefono,email,vat_number,
          fecha,plan,estado,prioridad,propuesta_enviada,fecha_seguimiento,
          proxima_accion,notas,cliente_id,venue_id,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [req.user.org_id||1, venue, ciudad, direccion, contacto, telefono, email,
       vat_number, fecha||new Date().toISOString().split('T')[0],
       plan, estado||'pending', prioridad||'medium', propuesta_enviada||false,
       fecha_seguimiento||null, proxima_accion, notas, cliente_id||null,
       venue_id||null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { srvErr(res, err); }
});

app.put('/api/ops/visitas/:id', auth, async (req, res) => {
  const allowed = ['venue','ciudad','direccion','contacto','telefono','email',
                   'vat_number','fecha','plan','estado','prioridad',
                   'propuesta_enviada','fecha_seguimiento','proxima_accion',
                   'notas','cliente_id','factura_id','venue_id'];
  const updates = [], p = [];
  allowed.forEach(f => {
    if (req.body[f] !== undefined) { p.push(req.body[f]); updates.push(`${f}=$${p.length}`); }
  });
  if (!updates.length) return res.status(400).json({ error: 'Nada que actualizar' });
  updates.push(`updated_at=NOW()`);
  p.push(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE ops.visitas SET ${updates.join(',')}
       WHERE id=$${p.length} AND org_id=${req.user.org_id||1} RETURNING *`, p
    );
    res.json(rows[0] || null);
  } catch (err) { srvErr(res, err); }
});

// ── OPS: FACTURAS — número siguiente (preview) ───────────────
app.get('/api/ops/facturas/next-number', auth, async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const { rows: [row] } = await pool.query(
      `SELECT COALESCE(MAX(CAST(SPLIT_PART(numero,'-',2) AS INTEGER)),0)+1 AS n
       FROM ops.facturas WHERE numero LIKE $1`,
      [`${year}-%`]
    );
    res.json({ numero: `${year}-${String(row.n).padStart(3,'0')}` });
  } catch (err) { srvErr(res, err); }
});

// ── OPS: ADMIN RESET (super_admin only) ─────────────────────
app.post('/api/ops/admin/reset', auth, async (req, res) => {
  if (!req.user.roles?.includes('super_admin')) return res.status(403).json({ error: 'Forbidden' });
  try {
    await pool.query(`
      TRUNCATE ops.factura_lineas, ops.facturas, ops.caja_movimientos, ops.jornadas, ops.visitas, ops.clientes
      RESTART IDENTITY CASCADE
    `);
    res.json({ ok: true });
  } catch (err) { srvErr(res, err); }
});

// ── AI: OPS (Heidi + fiscal + comercial) ─────────────────────

// POST /api/ai/ops/billing  — control de facturación y alertas de cobro
app.post('/api/ai/ops/billing', auth, async (req, res) => {
  try {
    const orgId = req.user.org_id || 1;
    const { desde, hasta } = req.body;
    const dateFrom = desde || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const dateTo   = hasta || new Date().toISOString().split('T')[0];

    const [facturas, caja, overdue] = await Promise.all([
      pool.query(`
        SELECT f.numero, f.estado, f.total, f.fecha_emision, f.fecha_vencimiento,
               f.tipo_iva, f.iva_importe, f.metodo_pago,
               c.nombre AS cliente, c.pais, c.tipo_cliente, c.vat_number
        FROM ops.facturas f
        LEFT JOIN ops.clientes c ON c.id = f.cliente_id
        WHERE f.org_id = $1 AND f.fecha_emision BETWEEN $2 AND $3
        ORDER BY f.fecha_emision DESC LIMIT 50
      `, [orgId, dateFrom, dateTo]),
      pool.query(`
        SELECT tipo, categoria, SUM(importe) AS total, COUNT(*) AS n
        FROM ops.caja_movimientos
        WHERE org_id = $1 AND fecha BETWEEN $2 AND $3
        GROUP BY tipo, categoria ORDER BY total DESC
      `, [orgId, dateFrom, dateTo]),
      pool.query(`
        SELECT f.numero, f.total, f.fecha_vencimiento, c.nombre AS cliente, c.email AS cliente_email
        FROM ops.facturas f
        LEFT JOIN ops.clientes c ON c.id = f.cliente_id
        WHERE f.org_id = $1 AND f.estado IN ('enviada','vencida') AND f.fecha_vencimiento < NOW()
        ORDER BY f.fecha_vencimiento ASC
      `, [orgId]),
    ]);

    const totalFacturado = facturas.rows.reduce((s, f) => s + Number(f.total), 0);
    const totalCobrado   = facturas.rows.filter(f => f.estado === 'cobrada').reduce((s, f) => s + Number(f.total), 0);
    // Pendiente = emitida y aún no cobrada (enviada o vencida); excluye borradores.
    const totalPendiente = facturas.rows.filter(f => f.estado === 'enviada' || f.estado === 'vencida').reduce((s, f) => s + Number(f.total), 0);
    const totalIVA       = facturas.rows.reduce((s, f) => s + Number(f.iva_importe), 0);

    const cajaSummary = caja.rows.map(r => `${r.tipo} / ${r.categoria || 'sin cat.'}: €${Number(r.total).toFixed(2)} (${r.n} movs.)`).join('\n');
    const overdueList = overdue.rows.map(f => `- ${f.cliente}: ${f.numero} · €${f.total} · vencida el ${f.fecha_vencimiento?.toISOString().split('T')[0]}`).join('\n');
    const facturasList = facturas.rows.slice(0, 15).map(f =>
      `- ${f.numero} | ${f.cliente} (${f.pais}) | €${f.total} | ${f.estado} | ${f.tipo_iva}`
    ).join('\n');

    const prompt = `Eres el asistente financiero de Novitum Technologies OÜ (OÜ Estonia, opera en España y Escandinavia).
Analiza la situación de facturación del período ${dateFrom} al ${dateTo} y genera un informe ejecutivo en español con:
1. Resumen financiero (facturado, cobrado, pendiente, IVA acumulado)
2. Alertas de facturas vencidas (${overdue.rows.length} facturas)
3. Análisis de flujo de caja (ingresos vs gastos)
4. Acciones prioritarias de cobro
5. Nota fiscal: identificar facturas intracomunitarias (clientes escandinavos/UE sin IVA)

Datos:
Período: ${dateFrom} → ${dateTo}
Total facturado: €${totalFacturado.toFixed(2)} | Cobrado: €${totalCobrado.toFixed(2)} | Pendiente: €${totalPendiente.toFixed(2)} | IVA total: €${totalIVA.toFixed(2)}

Facturas (últimas 15):
${facturasList || 'Sin facturas en el período'}

Facturas VENCIDAS (${overdue.rows.length}):
${overdueList || 'Ninguna vencida ✓'}

Caja por categoría:
${cajaSummary || 'Sin movimientos'}`;

    const r = await askLLM({ endpoint: 'billing', prompt, gemini });
    res.json({
      summary: r.text,
      provider: r.provider, model: r.model,
      meta: { dateFrom, dateTo, totalFacturado, totalCobrado, totalPendiente, totalIVA, overdueCount: overdue.rows.length, llm: r.meta },
    });
  } catch (err) {
    console.error('[AI ops/billing]', err.message);
    srvErr(res, err);
  }
});

// POST /api/ai/ops/accountant-report  — informe para gestor
app.post('/api/ai/ops/accountant-report', auth, async (req, res) => {
  try {
    const orgId = req.user.org_id || 1;
    const { mes, anio } = req.body;
    const year  = anio  || new Date().getFullYear();
    const month = mes   || new Date().getMonth() + 1;
    const dateFrom = `${year}-${String(month).padStart(2,'0')}-01`;
    const dateTo   = new Date(year, month, 0).toISOString().split('T')[0];

    const [facturas, caja, clientes] = await Promise.all([
      pool.query(`
        SELECT f.numero, f.fecha_emision, f.fecha_vencimiento, f.estado,
               f.subtotal, f.iva_importe, f.total, f.tipo_iva, f.iva_rate,
               c.nombre AS cliente, c.pais, c.vat_number, c.tipo_cliente
        FROM ops.facturas f
        LEFT JOIN ops.clientes c ON c.id = f.cliente_id
        WHERE f.org_id = $1 AND f.fecha_emision BETWEEN $2 AND $3
        ORDER BY f.fecha_emision ASC
      `, [orgId, dateFrom, dateTo]),
      pool.query(`
        SELECT tipo, concepto, importe, iva_importe, categoria, fecha
        FROM ops.caja_movimientos
        WHERE org_id = $1 AND fecha BETWEEN $2 AND $3
        ORDER BY fecha ASC
      `, [orgId, dateFrom, dateTo]),
      pool.query(`
        SELECT nombre, pais, vat_number, tipo_cliente
        FROM ops.clientes WHERE org_id = $1 AND activo = true
      `, [orgId]),
    ]);

    const ingresos  = caja.rows.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.importe), 0);
    const gastos    = caja.rows.filter(m => m.tipo === 'gasto').reduce((s, m) => s + Number(m.importe), 0);
    const ivaRep    = facturas.rows.filter(f => f.tipo_iva === 'normal' && f.pais === 'España').reduce((s, f) => s + Number(f.iva_importe), 0);
    const ivaIntra  = facturas.rows.filter(f => ['intracomunitario','exento'].includes(f.tipo_iva) || f.pais !== 'España').reduce((s, f) => s + Number(f.iva_importe), 0);
    const escandin  = facturas.rows.filter(f => ['Finlandia','Suecia','Noruega','Dinamarca'].includes(f.pais));
    const estoniaF  = facturas.rows.filter(f => f.pais === 'Estonia');

    const factList = facturas.rows.map(f =>
      `${f.numero} | ${f.fecha_emision?.toISOString().split('T')[0]} | ${f.cliente} | ${f.pais} | Base: €${f.subtotal} | IVA(${f.iva_rate}%): €${f.iva_importe} | Total: €${f.total} | ${f.tipo_iva} | ${f.estado}`
    ).join('\n');

    const prompt = `Eres el asistente contable de Novitum Technologies OÜ (Estonia).
La empresa opera desde Estonia y factura a clientes en España y Escandinavia.
Genera el informe mensual para el gestor correspondiente al mes ${month}/${year} en español, estructurado así:

# INFORME MENSUAL — ${month}/${year}
## 1. Resumen de ingresos y gastos
## 2. Facturación emitida (desglose por cliente y tipo de IVA)
## 3. IVA repercutido España (tipo normal 21%)
## 4. Operaciones intracomunitarias / OSS (clientes UE fuera de Estonia)
## 5. Clientes escandinavos (${escandin.length} facturas) — régimen OSS aplicable
## 6. Resultado del mes (ingresos - gastos)
## 7. Recomendaciones para el gestor

Datos:
Período: ${dateFrom} → ${dateTo}
Ingresos caja: €${ingresos.toFixed(2)} | Gastos: €${gastos.toFixed(2)} | Resultado: €${(ingresos - gastos).toFixed(2)}
IVA español acumulado: €${ivaRep.toFixed(2)}
Operaciones intracomunitarias/exentas: €${ivaIntra.toFixed(2)}
Facturas clientes escandinavos: ${escandin.length} | Facturas Estonia: ${estoniaF.length}

FACTURAS EMITIDAS (${facturas.rows.length}):
${factList || 'Sin facturas en el período'}

CONTEXTO FISCAL:
- OÜ Estonia: 0% impuesto de sociedades hasta distribución de dividendos
- Clientes españoles: IVA 21% repercutido
- Clientes UE (escandinavos): operaciones intracomunitarias B2B (exentas con VAT number) o régimen OSS B2C
- Registrikood: 17545241 | VAT OÜ: pendiente de confirmar`;

    const r = await askLLM({ endpoint: 'accountant-report', prompt, gemini });
    res.json({
      report: r.text,
      provider: r.provider, model: r.model,
      meta: { month, year, dateFrom, dateTo, ingresos, gastos, resultado: ingresos - gastos, ivaRep, ivaIntra, facturas: facturas.rows.length, llm: r.meta },
    });
  } catch (err) {
    console.error('[AI ops/accountant-report]', err.message);
    srvErr(res, err);
  }
});

// POST /api/ai/ops/contracts-review  — revisión de contratos cerrados
app.post('/api/ai/ops/contracts-review', auth, async (req, res) => {
  try {
    const { days } = req.body;
    const since = new Date(Date.now() - ((days || 30) * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

    const [contracts, accounts] = await Promise.all([
      pool.query(`
        SELECT fc.venue_name, fc.doc_type, fc.client_name, fc.client_business,
               fc.plan, fc.price, fc.billing, fc.signed_at, fc.client_email,
               u.name AS agent
        FROM field.contracts fc
        LEFT JOIN core.users u ON u.id = fc.sent_by
        WHERE fc.signed_at >= $1
        ORDER BY fc.signed_at DESC LIMIT 50
      `, [since]).catch(() => ({ rows: [] })),  // Field puede no estar desplegado
      pool.query(`
        SELECT name, plan, stage, mrr, zone FROM crm.accounts
        WHERE org_id = $1 AND stage = 'active'
        ORDER BY mrr DESC LIMIT 20
      `, [req.user.org_id || 1]),
    ]);

    const byPlan = contracts.rows.reduce((acc, c) => {
      const p = c.plan || 'sin_plan';
      acc[p] = (acc[p] || 0) + 1;
      return acc;
    }, {});
    const mrr = accounts.rows.reduce((s, a) => s + Number(a.mrr), 0);
    const contractList = contracts.rows.map(c =>
      `- ${c.agent}: "${c.venue_name}" → ${c.plan || c.doc_type} · €${c.price || '?'} · ${c.billing || '?'} · firmado ${c.signed_at?.toISOString().split('T')[0]}`
    ).join('\n');

    const prompt = `Eres el asistente comercial de PulseCosta. Analiza los contratos cerrados en los últimos ${days || 30} días y genera un informe en español con:
1. Resumen de contratos firmados (total, por plan, por agente)
2. MRR generado por nuevos contratos
3. Contratos destacados
4. Observaciones sobre patrones de cierre
5. Recomendaciones para acelerar más cierres

Período: últimos ${days || 30} días (desde ${since})
Contratos firmados: ${contracts.rows.length}
Por plan: ${JSON.stringify(byPlan)}
MRR total cuentas activas: €${mrr.toFixed(2)}/mes

Detalle contratos:
${contractList || 'Sin contratos en el período'}`;

    const r = await askLLM({ endpoint: 'contracts-review', prompt, gemini });
    res.json({
      summary: r.text,
      provider: r.provider, model: r.model,
      meta: { since, total: contracts.rows.length, byPlan, mrrActive: mrr, llm: r.meta },
    });
  } catch (err) {
    console.error('[AI ops/contracts-review]', err.message);
    srvErr(res, err);
  }
});

// POST /api/ai/ops/heidi  — asistente de Heidi (clientes + fiscal)
app.post('/api/ai/ops/heidi', auth, async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'question es obligatorio' });

    // ── LegalKB: si la pregunta es legal/fiscal, consultar el RAG legal ──
    const legalIntent = detectLegal(question);
    let legal = null;
    if (legalIntent.isLegal) {
      try {
        legal = await askLegalKB({ message: question, pais: legalIntent.pais, categoria: legalIntent.categoria });
      } catch (e) {
        console.warn('[AI ops/heidi] LegalKB no disponible:', e.message);
        legal = { error: true };
      }
      // PII detectada: el KB bloquea; devolvemos su guía sin pasar por el LLM.
      if (legal?.blocked) {
        return res.json({ answer: legal.message, source: 'legal-kb', legal: { blocked: true, detected: legal.detected } });
      }
    }
    const legalOk = !!(legal && !legal.error && !legal.blocked && !legal.degraded);

    const orgId = req.user.org_id || 1;
    const [clientes, facturasPending, accounts] = await Promise.all([
      pool.query(`
        SELECT c.nombre, c.pais, c.tipo_cliente, c.vat_number, c.email, c.contacto,
               COUNT(f.id) AS num_facturas,
               SUM(CASE WHEN f.estado IN ('enviada','vencida') THEN f.total ELSE 0 END) AS deuda_pendiente
        FROM ops.clientes c
        LEFT JOIN ops.facturas f ON f.cliente_id = c.id AND f.org_id = c.org_id
        WHERE c.org_id = $1 AND c.activo = true
        GROUP BY c.id ORDER BY c.nombre
      `, [orgId]),
      pool.query(`
        SELECT f.numero, f.total, f.fecha_vencimiento, f.estado, c.nombre AS cliente, c.pais, c.email AS cliente_email
        FROM ops.facturas f
        LEFT JOIN ops.clientes c ON c.id = f.cliente_id
        WHERE f.org_id = $1 AND f.estado IN ('enviada','vencida')
        ORDER BY f.fecha_vencimiento ASC LIMIT 20
      `, [orgId]),
      pool.query(`
        SELECT name, plan, mrr, stage, zone, contact_email
        FROM crm.accounts WHERE org_id = $1 AND stage = 'active'
        ORDER BY mrr DESC
      `, [orgId]),
    ]);

    const clientesList = clientes.rows.map(c =>
      `${c.nombre} | ${c.pais} | ${c.tipo_cliente} | VAT: ${c.vat_number || 'N/A'} | Deuda: €${Number(c.deuda_pendiente || 0).toFixed(2)}`
    ).join('\n');
    const pendingList = facturasPending.rows.map(f =>
      `- ${f.numero} | ${f.cliente} (${f.pais}) | €${f.total} | vence ${f.fecha_vencimiento?.toISOString().split('T')[0] || 'N/A'}`
    ).join('\n');
    const accountsList = accounts.rows.map(a =>
      `${a.name} | ${a.plan} | €${a.mrr}/mes | ${a.zone}`
    ).join('\n');

    const prompt = `Eres el asistente personal de Heidi (COO/finanzas de Novitum Technologies OÜ, Estonia).
Heidi gestiona las finanzas, la base de clientes y las consultas fiscales.
La empresa opera desde Estonia y tiene clientes en España y Escandinavia.

CONTEXTO FISCAL CLAVE:
- Novitum Technologies OÜ (Estonia): impuesto de sociedades 0% hasta distribución dividendos
- Clientes españoles (B2B): IVA 21% repercutido, obligación declaración trimestral
- Clientes escandinavos B2B: operación intracomunitaria exenta (necesitan VAT válido)
- Clientes escandinavos B2C: régimen OSS (One Stop Shop UE)
- Registrikood (Estonia): 17545241
- Heidi gestiona también el mercado nórdico (Finlandia, Suecia, contactos propios)

DATOS ACTUALES:
Clientes activos (${clientes.rows.length}):
${clientesList}

Facturas pendientes de cobro (${facturasPending.rows.length}):
${pendingList || 'Sin facturas pendientes ✓'}

Cuentas CRM activas (${accounts.rows.length}):
${accountsList}
${legalOk ? `
CONTEXTO LEGAL AUTORITATIVO (de NOVITUM Legal KB — RAG legal, modelo local). Para CUALQUIER afirmación legal o fiscal básate SOLO en esto; cita las fuentes al final y NO inventes normativa. Si el contexto no cubre la pregunta, dilo claramente:
${legal.response}
Fuentes legales: ${(legal.fuentes || []).join(' | ') || '—'}
` : ''}
Pregunta de Heidi: ${question}

Responde en el mismo idioma en el que Heidi te ha preguntado (ES/EN/FI/ET/SV). Sé preciso y práctico. Si es una consulta fiscal, sé específico con las obligaciones de Estonia OÜ y las reglas UE aplicables${legalOk ? ', apoyándote en el CONTEXTO LEGAL AUTORITATIVO y citando sus fuentes' : ''}.`;

    const r = await askLLM({ endpoint: 'heidi', prompt, gemini });
    res.json({
      answer: r.text, provider: r.provider, model: r.model, meta: r.meta,
      legal: legalOk
        ? { fuentes: legal.fuentes, disclaimer: legal.disclaimer, model: legal.model, request_id: legal.request_id, service_version: legal.service_version }
        : undefined,
    });
  } catch (err) {
    console.error('[AI ops/heidi]', err.message);
    srvErr(res, err);
  }
});

// ── OPS: VENUES (read-only sobre public.venues) ──────────────
// Los 1269 locales de la Costa del Sol. CRM/OPS los consumen para prospecting.
// Filtros: zone_id, category, search, unclaimed, unvisited
// Paginación: limit (default 50, max 500), offset

app.get('/api/ops/venues/zones', auth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT z.id, z.name, COUNT(v.id)::int AS venue_count
       FROM public.zones z
       LEFT JOIN public.venues v ON v.zone_id = z.id AND v.is_active = true
       GROUP BY z.id, z.name ORDER BY venue_count DESC`
    );
    res.json(rows);
  } catch (err) { srvErr(res, err); }
});

app.get('/api/ops/venues', auth, async (req, res) => {
  try {
    const { zone_id, category, search, unclaimed, unvisited } = req.query;
    const limit  = Math.min(parseInt(req.query.limit)  || 50, 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    let where = 'v.is_active = true';
    const p = [];
    if (zone_id) { p.push(zone_id); where += ` AND v.zone_id = $${p.length}`; }
    if (category) { p.push(category); where += ` AND v.category = $${p.length}`; }
    if (search) { p.push(`%${search}%`); where += ` AND (v.name ILIKE $${p.length} OR v.address ILIKE $${p.length})`; }
    if (unclaimed === 'true') where += ' AND v.owner_firebase_uid IS NULL';
    if (unvisited === 'true') {
      p.push(req.user.org_id || 1);
      where += ` AND NOT EXISTS (SELECT 1 FROM ops.visitas vs WHERE vs.org_id = $${p.length} AND vs.venue_id = v.id)`;
    }

    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT v.id, v.name, v.category, v.address, v.phone, v.website,
                v.lat, v.lng, v.plan_type, v.is_verified,
                v.owner_firebase_uid IS NOT NULL AS claimed,
                z.name AS zone_name
         FROM public.venues v
         JOIN public.zones z ON z.id = v.zone_id
         WHERE ${where}
         ORDER BY v.name
         LIMIT ${limit} OFFSET ${offset}`,
        p
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM public.venues v WHERE ${where}`,
        p
      ),
    ]);

    res.json({ venues: rows.rows, total: total.rows[0].total, limit, offset });
  } catch (err) { srvErr(res, err); }
});

app.get('/api/ops/venues/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT v.*, z.name AS zone_name
       FROM public.venues v
       JOIN public.zones z ON z.id = v.zone_id
       WHERE v.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Venue no encontrado' });
    res.json(rows[0]);
  } catch (err) { srvErr(res, err); }
});

// ── HEALTH ───────────────────────────────────────────────────
app.get('/api/ops/health', async (_, res) => {
  const health = { status: 'ok', api: 'ok', db: 'ok', version: 'ops-api-1.0', ts: new Date().toISOString() };
  try { await pool.query('SELECT 1'); } catch { health.db = 'error'; health.status = 'degraded'; }
  res.json(health);
});

// ── START ────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`OPS API — puerto ${PORT}`);
  await ensureVisitasTable();
});
