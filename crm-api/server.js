require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { Pool } = require('pg');

const app        = express();
const PORT       = process.env.PORT || 3010;
const JWT_SECRET = process.env.JWT_SECRET;

const pool = new Pool({
  host:     process.env.DB_HOST     || 'postgres',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'pulsecosta_db',
  user:     process.env.DB_USER     || 'pulsecosta',
  password: process.env.DB_PASSWORD,
});

const _allowedOrigins = (process.env.CORS_ORIGIN || 'https://crm.pulsecosta.es,https://ops.pulsecosta.es,https://field.pulsecosta.es').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    const o = origin ? origin.replace(/\.$/, '') : origin;
    return (!o || _allowedOrigins.includes(o)) ? cb(null, true) : cb(new Error('CORS not allowed'));
  },
  credentials: true,
}));
app.use(express.json());

// ── Auth middleware ──────────────────────────────────────────
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(h.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token invalido' }); }
}

// ── Migración one-time public.crm_* → crm.* ─────────────────
async function migrateIfNeeded() {
  try {
    const { rows: [{ count }] } = await pool.query('SELECT COUNT(*)::int FROM crm.accounts');
    if (count > 0) { console.log('[migration] crm.* ya tiene datos — omitida'); return; }
    console.log('[migration] Copiando public.crm_* → crm.*...');

    await pool.query(`
      INSERT INTO crm.accounts
        (id, org_id, name, type, plan, stage, zone, assigned_to,
         mrr, pulse_score, contact_name, contact_phone, contact_email,
         address, notes, created_at, updated_at)
      SELECT a.id, 1,
        a.name,
        CASE WHEN a.plan ILIKE '%hotel%' THEN 'hotel' ELSE 'local' END,
        a.plan, a.stage, a.zone,
        u.id,
        a.mrr, a.pulse_score, a.contact_name, a.contact_phone, a.contact_email,
        a.address, a.notes, a.created_at, a.updated_at
      FROM public.crm_accounts a
      LEFT JOIN core.users u ON u.name = a.assigned_to
    `);
    await pool.query(`SELECT setval(pg_get_serial_sequence('crm.accounts','id'), MAX(id)) FROM crm.accounts`);

    await pool.query(`
      INSERT INTO crm.leads
        (id, org_id, name, type, zone, source, stage, phone, email, assigned_to, notes, created_at)
      SELECT l.id, 1, l.name, l.type, l.zone, l.source, l.stage, l.phone, l.email,
        u.id, l.notes, l.created_at
      FROM public.crm_leads l
      LEFT JOIN core.users u ON u.name = l.assigned_to
    `);
    await pool.query(`SELECT setval(pg_get_serial_sequence('crm.leads','id'), MAX(id)) FROM crm.leads`);

    await pool.query(`
      INSERT INTO crm.tasks
        (id, org_id, title, priority, due_at, assigned_to, account_id, done, created_at)
      SELECT t.id, 1, t.title, t.priority, t.due_at,
        u.id, t.account_id, t.done, t.created_at
      FROM public.crm_tasks t
      LEFT JOIN core.users u ON u.name = t.assigned_to
    `);
    await pool.query(`SELECT setval(pg_get_serial_sequence('crm.tasks','id'), MAX(id)) FROM crm.tasks`);

    await pool.query(`
      INSERT INTO crm.activities
        (id, org_id, type, description, agent_id, account_id, created_at)
      SELECT a.id, 1, a.type, a.description,
        u.id, a.account_id, a.created_at
      FROM public.crm_activities a
      LEFT JOIN core.users u ON u.name = a.agent
    `);
    await pool.query(`SELECT setval(pg_get_serial_sequence('crm.activities','id'), MAX(id)) FROM crm.activities`);

    console.log('[migration] Completada ✓');
  } catch (err) {
    console.error('[migration] Error:', err.message);
  }
}

// ── Orden de roles (mayor → menor privilegio) ───────────────
const ROLE_ORDER = ['super_admin','finance_admin','ops_admin','sales_admin',
                    'cs_manager','sales_rep','worker','freelance','read_only'];

function primaryRole(roles = []) {
  return ROLE_ORDER.find(r => roles.includes(r)) || roles[0] || 'read_only';
}

function isSalesRepOnly(user) {
  return user.role === 'sales_rep' && !user.roles?.includes('super_admin');
}

// ── LOGIN ────────────────────────────────────────────────────
app.post('/api/crm/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Faltan campos' });
  try {
    const { rows } = await pool.query(
      `SELECT u.*, array_agg(r.role) FILTER (WHERE r.role IS NOT NULL) AS roles
       FROM core.users u
       LEFT JOIN core.user_roles r ON r.user_id = u.id AND r.org_id = 1
       WHERE u.email = $1 AND u.active = true
       GROUP BY u.id`,
      [email.toLowerCase()]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Credenciales incorrectas' });

    const roles   = user.roles || [];
    const role    = primaryRole(roles);
    await pool.query('UPDATE core.users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role, roles, org_id: 1 },
      JWT_SECRET, { expiresIn: '8h' }
    );
    res.json({ token, user: { id: user.id, email: user.email, name: user.name,
      role, roles, initials: user.initials } });
  } catch (err) { res.status(500).json({ error: 'Error del servidor' }); }
});

// ── CRM: ACCOUNTS ────────────────────────────────────────────
app.get('/api/crm/accounts', auth, async (req, res) => {
  try {
    const { stage, plan, zone, search } = req.query;
    const orgId = req.user.org_id || 1;
    let q = `SELECT a.*, u.name AS assigned_to, u.initials AS assigned_initials
             FROM crm.accounts a
             LEFT JOIN core.users u ON u.id = a.assigned_to
             WHERE a.org_id = $1`;
    const p = [orgId];
    if (stage)  { p.push(stage);         q += ` AND a.stage = $${p.length}`; }
    if (plan)   { p.push(plan);          q += ` AND a.plan  = $${p.length}`; }
    if (zone)   { p.push(zone);          q += ` AND a.zone  = $${p.length}`; }
    if (search) { p.push(`%${search}%`); q += ` AND a.name ILIKE $${p.length}`; }
    if (isSalesRepOnly(req.user)) { p.push(req.user.id); q += ` AND a.assigned_to = $${p.length}`; }
    q += ' ORDER BY a.updated_at DESC';
    const { rows } = await pool.query(q, p);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/crm/accounts', auth, async (req, res) => {
  const { name, type, plan, stage, mrr, zone, assigned_to,
          contact_name, contact_email, contact_phone, address, notes } = req.body;
  try {
    let assignedId = req.user.id;
    if (assigned_to && assigned_to !== req.user.name) {
      const { rows: u } = await pool.query('SELECT id FROM core.users WHERE name = $1', [assigned_to]);
      if (u[0]) assignedId = u[0].id;
    }
    const { rows } = await pool.query(
      `INSERT INTO crm.accounts
         (org_id,name,type,plan,stage,mrr,zone,assigned_to,
          contact_name,contact_email,contact_phone,address,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.user.org_id||1, name, type, plan, stage||'new', mrr||0, zone, assignedId,
       contact_name, contact_email, contact_phone, address, notes]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/crm/accounts/:id', auth, async (req, res) => {
  const allowed = ['name','type','plan','stage','mrr','zone',
                   'contact_name','contact_email','contact_phone','address','notes','pulse_score'];
  const updates = [], p = [];
  allowed.forEach(f => {
    if (req.body[f] !== undefined) { p.push(req.body[f]); updates.push(`${f}=$${p.length}`); }
  });
  if (req.body.assigned_to !== undefined) {
    const { rows: u } = await pool.query('SELECT id FROM core.users WHERE name = $1', [req.body.assigned_to]);
    if (u[0]) { p.push(u[0].id); updates.push(`assigned_to=$${p.length}`); }
  }
  if (!updates.length) return res.status(400).json({ error: 'Nada que actualizar' });
  p.push(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE crm.accounts SET ${updates.join(',')},updated_at=NOW()
       WHERE id=$${p.length} AND org_id=${req.user.org_id||1} RETURNING *`, p
    );
    res.json(rows[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CRM: LEADS ───────────────────────────────────────────────
app.get('/api/crm/leads', auth, async (req, res) => {
  try {
    const { stage, zone, search } = req.query;
    const orgId = req.user.org_id || 1;
    let q = `SELECT l.*, u.name AS assigned_to
             FROM crm.leads l
             LEFT JOIN core.users u ON u.id = l.assigned_to
             WHERE l.org_id = $1`;
    const p = [orgId];
    if (stage)  { p.push(stage);         q += ` AND l.stage = $${p.length}`; }
    if (zone)   { p.push(zone);          q += ` AND l.zone  = $${p.length}`; }
    if (search) { p.push(`%${search}%`); q += ` AND l.name ILIKE $${p.length}`; }
    if (isSalesRepOnly(req.user)) { p.push(req.user.id); q += ` AND l.assigned_to = $${p.length}`; }
    q += ' ORDER BY l.created_at DESC';
    const { rows } = await pool.query(q, p);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/crm/leads', auth, async (req, res) => {
  const { name, type, zone, source, phone, email, notes } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO crm.leads (org_id,name,type,zone,source,phone,email,notes,assigned_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.org_id||1, name, type||'local', zone, source||'directo',
       phone, email, notes, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/crm/leads/:id', auth, async (req, res) => {
  const allowed = ['name','type','zone','source','phone','email','notes','stage'];
  const updates = [], p = [];
  allowed.forEach(f => {
    if (req.body[f] !== undefined) { p.push(req.body[f]); updates.push(`${f}=$${p.length}`); }
  });
  if (!updates.length) return res.status(400).json({ error: 'Nada que actualizar' });
  p.push(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE crm.leads SET ${updates.join(',')}
       WHERE id=$${p.length} AND org_id=${req.user.org_id||1} RETURNING *`, p
    );
    res.json(rows[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CRM: TASKS ───────────────────────────────────────────────
app.get('/api/crm/tasks', auth, async (req, res) => {
  try {
    const orgId = req.user.org_id || 1;
    let q = `SELECT t.*, u.name AS assigned_to, a.name AS account_name
             FROM crm.tasks t
             LEFT JOIN core.users u    ON u.id = t.assigned_to
             LEFT JOIN crm.accounts a  ON a.id = t.account_id
             WHERE t.org_id = $1`;
    const p = [orgId];
    if (isSalesRepOnly(req.user)) { p.push(req.user.id); q += ` AND t.assigned_to = $${p.length}`; }
    q += ' ORDER BY t.done ASC, t.due_at ASC';
    const { rows } = await pool.query(q, p);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/crm/tasks', auth, async (req, res) => {
  const { title, priority, due_at, assigned_to, account_id } = req.body;
  try {
    let assignedId = req.user.id;
    if (assigned_to && assigned_to !== req.user.name) {
      const { rows: u } = await pool.query('SELECT id FROM core.users WHERE name = $1', [assigned_to]);
      if (u[0]) assignedId = u[0].id;
    }
    const { rows } = await pool.query(
      `INSERT INTO crm.tasks (org_id,title,priority,due_at,assigned_to,account_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.org_id||1, title, priority||'medium', due_at, assignedId, account_id||null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/crm/tasks/:id', auth, async (req, res) => {
  const updates = [], p = [];
  if (req.body.done !== undefined) { p.push(req.body.done);     updates.push(`done=$${p.length}`); }
  if (req.body.title)              { p.push(req.body.title);    updates.push(`title=$${p.length}`); }
  if (req.body.priority)           { p.push(req.body.priority); updates.push(`priority=$${p.length}`); }
  if (!updates.length) return res.status(400).json({ error: 'Nada que actualizar' });
  p.push(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE crm.tasks SET ${updates.join(',')}
       WHERE id=$${p.length} AND org_id=${req.user.org_id||1} RETURNING *`, p
    );
    res.json(rows[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CRM: ACTIVITIES ──────────────────────────────────────────
app.get('/api/crm/activities', auth, async (req, res) => {
  try {
    const { account_id, type } = req.query;
    const orgId = req.user.org_id || 1;
    let q = `SELECT a.*, u.name AS agent, ac.name AS account_name
             FROM crm.activities a
             LEFT JOIN core.users u    ON u.id = a.agent_id
             LEFT JOIN crm.accounts ac ON ac.id = a.account_id
             WHERE a.org_id = $1`;
    const p = [orgId];
    if (account_id) { p.push(Number(account_id)); q += ` AND a.account_id = $${p.length}`; }
    if (type)       { p.push(type);               q += ` AND a.type = $${p.length}`; }
    q += ' ORDER BY a.created_at DESC LIMIT 200';
    const { rows } = await pool.query(q, p);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/crm/activities', auth, async (req, res) => {
  const { type, description, account_id } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO crm.activities (org_id,type,description,account_id,agent_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.org_id||1, type||'note', description, account_id||null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CRM: DASHBOARD ───────────────────────────────────────────
app.get('/api/crm/dashboard', auth, async (req, res) => {
  try {
    const orgId = req.user.org_id || 1;
    const [accounts, leads, tasks] = await Promise.all([
      pool.query('SELECT stage, mrr FROM crm.accounts WHERE org_id = $1', [orgId]),
      pool.query('SELECT stage FROM crm.leads WHERE org_id = $1', [orgId]),
      pool.query('SELECT done FROM crm.tasks WHERE org_id = $1', [orgId]),
    ]);
    const active = accounts.rows.filter(a => a.stage === 'active');
    res.json({
      mrr:            active.reduce((s, a) => s + Number(a.mrr), 0),
      activeAccounts: active.length,
      totalLeads:     leads.rows.length,
      pendingTasks:   tasks.rows.filter(t => !t.done).length,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/ops/workers', auth, async (req, res) => {
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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/ops/clientes/:id', auth, async (req, res) => {
  const allowed = ['nombre','contacto','vat_number','tipo_cliente','pais',
                   'email','telefono','direccion','codigo_postal','ciudad','notas','activo','crm_account_id'];
  const updates = [], p = [];
  allowed.forEach(f => {
    if (req.body[f] !== undefined) { p.push(req.body[f]); updates.push(`${f}=$${p.length}`); }
  });
  if (!updates.length) return res.status(400).json({ error: 'Nada que actualizar' });
  p.push(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE ops.clientes SET ${updates.join(',')}
       WHERE id=$${p.length} AND org_id=${req.user.org_id||1} RETURNING *`, p
    );
    res.json(rows[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/ops/facturas/:id/lineas', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM ops.factura_lineas WHERE factura_id = $1 ORDER BY orden',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/ops/facturas', auth, async (req, res) => {
  const { cliente_id, fecha_emision, fecha_vencimiento, metodo_pago,
          tipo_iva, iva_rate, subtotal, iva_importe, total,
          tipo, intervalo_recurrencia, notas, lineas } = req.body;
  if (!cliente_id) return res.status(400).json({ error: 'cliente_id es obligatorio' });
  const client = pool;
  try {
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
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
});

app.put('/api/ops/facturas/:id', auth, async (req, res) => {
  const allowed = ['estado','fecha_vencimiento','metodo_pago','tipo_iva',
                   'iva_rate','subtotal','iva_importe','total','notas'];
  const updates = [], p = [];
  allowed.forEach(f => {
    if (req.body[f] !== undefined) { p.push(req.body[f]); updates.push(`${f}=$${p.length}`); }
  });
  if (!updates.length) return res.status(400).json({ error: 'Nada que actualizar' });
  p.push(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE ops.facturas SET ${updates.join(',')}
       WHERE id=$${p.length} AND org_id=${req.user.org_id||1} RETURNING *`, p
    );
    res.json(rows[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
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
    if (desde) { p.push(desde); q += ` AND m.fecha >= $${p.length}`; }
    if (hasta) { p.push(hasta); q += ` AND m.fecha <= $${p.length}`; }
    q += ' ORDER BY m.fecha DESC, m.created_at DESC';
    const { rows } = await pool.query(q, p);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
    // workers ven solo las suyas; admins ven todas
    if (!req.user.roles?.includes('super_admin') && !req.user.roles?.includes('ops_admin')) {
      p.push(req.user.id); q += ` AND j.user_id = $${p.length}`;
    }
    q += ' ORDER BY j.fecha DESC, j.entrada DESC';
    const { rows } = await pool.query(q, p);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/ops/jornadas/entrada', auth, async (req, res) => {
  const { lat, lng, direccion } = req.body;
  try {
    const today = new Date().toISOString().split('T')[0];
    // Verificar que no hay jornada abierta hoy
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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
      created_by         INTEGER REFERENCES core.users(id),
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS visitas_org_idx    ON ops.visitas(org_id);
    CREATE INDEX IF NOT EXISTS visitas_estado_idx ON ops.visitas(estado);
  `);
}

app.get('/api/ops/visitas', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT v.*, c.nombre AS cliente_nombre
       FROM ops.visitas v
       LEFT JOIN ops.clientes c ON c.id = v.cliente_id
       WHERE v.org_id = $1 ORDER BY v.fecha DESC, v.created_at DESC`,
      [req.user.org_id || 1]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/ops/visitas', auth, async (req, res) => {
  const { venue, ciudad, direccion, contacto, telefono, email, vat_number,
          fecha, plan, estado, prioridad, propuesta_enviada,
          fecha_seguimiento, proxima_accion, notas, cliente_id } = req.body;
  if (!venue) return res.status(400).json({ error: 'venue es obligatorio' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO ops.visitas
         (org_id,venue,ciudad,direccion,contacto,telefono,email,vat_number,
          fecha,plan,estado,prioridad,propuesta_enviada,fecha_seguimiento,
          proxima_accion,notas,cliente_id,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [req.user.org_id||1, venue, ciudad, direccion, contacto, telefono, email,
       vat_number, fecha||new Date().toISOString().split('T')[0],
       plan, estado||'pending', prioridad||'medium', propuesta_enviada||false,
       fecha_seguimiento||null, proxima_accion, notas, cliente_id||null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/ops/visitas/:id', auth, async (req, res) => {
  const allowed = ['venue','ciudad','direccion','contacto','telefono','email',
                   'vat_number','fecha','plan','estado','prioridad',
                   'propuesta_enviada','fecha_seguimiento','proxima_accion',
                   'notas','cliente_id','factura_id'];
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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── OPS: ADMIN RESET (super_admin only) ─────────────────────
app.post('/api/ops/admin/reset', auth, async (req, res) => {
  if (!req.user.roles?.includes('super_admin')) return res.status(403).json({ error: 'Forbidden' });
  try {
    await pool.query(`
      TRUNCATE ops.factura_lineas, ops.facturas, ops.caja, ops.jornadas, ops.visitas, ops.clientes
      RESTART IDENTITY CASCADE
    `);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── FIELD: TABLES SETUP ──────────────────────────────────────
async function ensureFieldTables() {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS field`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS field.venues (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      type          TEXT NOT NULL DEFAULT 'local' CHECK (type IN ('local','hotel')),
      zone          TEXT,
      address       TEXT,
      contact_name  TEXT,
      contact_phone TEXT,
      contact_email TEXT,
      status        TEXT NOT NULL DEFAULT 'pending',
      notes         TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS field.visits (
      id          SERIAL PRIMARY KEY,
      venue_id    INTEGER,
      venue_name  TEXT NOT NULL,
      agent_id    INTEGER REFERENCES core.users(id),
      status      TEXT NOT NULL,
      notes       TEXT,
      doc_sent    TEXT,
      visited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS field.contracts (
      id                 SERIAL PRIMARY KEY,
      venue_id           INTEGER,
      venue_name         TEXT,
      doc_type           TEXT NOT NULL,
      client_email       TEXT,
      client_name        TEXT,
      client_business    TEXT,
      client_cif         TEXT,
      plan               TEXT,
      price              TEXT,
      billing            TEXT,
      signer_name        TEXT,
      signature_data_url TEXT,
      signed_at          TIMESTAMPTZ,
      sent_by            INTEGER REFERENCES core.users(id),
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS field.demos (
      id            SERIAL PRIMARY KEY,
      venue_id      INTEGER,
      venue_name    TEXT,
      contact_name  TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      scheduled_at  TIMESTAMPTZ NOT NULL,
      notes         TEXT,
      agent_id      INTEGER REFERENCES core.users(id),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const { rows: [{ count }] } = await pool.query('SELECT COUNT(*)::int FROM field.venues');
  if (count === 0) {
    await pool.query(`
      INSERT INTO field.venues (name,type,zone,address,contact_name,contact_phone,contact_email) VALUES
      ('La Bahía Club','local','Puerto Banús','Avda. Julio Iglesias 1, Puerto Banús','Marco Díaz','622 111 222','info@labahiaclub.es'),
      ('La Terraza del Puerto','local','Marbella','Puerto Deportivo de Marbella, Local 12','Ana Ruiz','634 222 333','terraza@marbella.es'),
      ('Flamenco Andaluz','local','Torremolinos','C/ San Miguel 45, Torremolinos','Carlos Moreno','612 333 444','flamenco@andaluz.es'),
      ('The Jazz Corner','local','Fuengirola','Paseo Marítimo Rey de España 80','David Linares','655 444 555','hello@jazzcorner.es'),
      ('Hotel Brisa Marina','hotel','Marbella','Ctra. de Cádiz km 176, Marbella','Sofía Vega','952 777 888','direccion@brisamarina.es'),
      ('Chiringuito Los Gallos','local','Estepona','Playa del Cristo, Estepona','Pedro Gallego','600 555 666','losgallos@estepona.es'),
      ('Restaurante El Faro','local','Benalmádena','Puerto Marina, Local 45, Benalmádena','Lucía Torres','633 666 777','elfaro@benalmadena.es'),
      ('Hotel Sol Arena','hotel','Fuengirola','Paseo Marítimo 120, Fuengirola','Javier Blanco','952 888 999','jblanco@solarena.es'),
      ('Club Náutico Marbella','local','Marbella','Puerto Deportivo de Marbella, Muelle Sur','Roberto Sanz','611 999 000','info@nauticomarbella.es'),
      ('Sunset Beach Club','local','Benalmádena','Ctra. de Cádiz km 220, Benalmádena','Isabel Romero','644 000 111','sunset@beachclub.es')
    `);
    console.log('[field] Venues sembrados ✓');
  }
}

// ── FIELD: AUTH MIDDLEWARE ────────────────────────────────────
function fieldAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(h.slice(7), JWT_SECRET);
    const allowed = ['field_agent', 'sales_admin', 'super_admin'];
    if (!decoded.roles?.some(r => allowed.includes(r)))
      return res.status(403).json({ error: 'Sin acceso a PulseField' });
    req.user = decoded;
    next();
  } catch { res.status(401).json({ error: 'Token invalido' }); }
}

// ── FIELD: LOGIN ──────────────────────────────────────────────
app.post('/api/field/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Faltan campos' });
  try {
    const { rows } = await pool.query(
      `SELECT u.*, array_agg(r.role) FILTER (WHERE r.role IS NOT NULL) AS roles
       FROM core.users u
       LEFT JOIN core.user_roles r ON r.user_id = u.id AND r.org_id = 1
       WHERE u.email = $1 AND u.active = true
       GROUP BY u.id`,
      [email.toLowerCase()]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Credenciales incorrectas' });

    const roles = user.roles || [];
    const allowed = ['field_agent', 'sales_admin', 'super_admin'];
    if (!roles.some(r => allowed.includes(r)))
      return res.status(403).json({ error: 'Sin acceso a PulseField' });

    const role = roles.some(r => ['sales_admin','super_admin'].includes(r)) ? 'sales_admin' : 'field_agent';
    await pool.query('UPDATE core.users SET last_login = NOW() WHERE id = $1', [user.id]);
    const initials = user.initials || user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role, roles, org_id: 1 },
      JWT_SECRET, { expiresIn: '8h' }
    );
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role, initials } });
  } catch (err) { res.status(500).json({ error: 'Error del servidor' }); }
});

// ── FIELD: REGISTER ───────────────────────────────────────────
app.post('/api/field/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Faltan campos' });
  if (password.length < 6) return res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const initials = name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const { rows: [newUser] } = await pool.query(
      `INSERT INTO core.users (email, password_hash, name, initials)
       VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING RETURNING id`,
      [email.toLowerCase(), hash, name.trim(), initials]
    );
    if (!newUser) return res.status(409).json({ error: 'Email ya registrado' });
    await pool.query(
      `INSERT INTO core.user_roles (user_id, org_id, role) VALUES ($1,1,'field_agent') ON CONFLICT DO NOTHING`,
      [newUser.id]
    );
    const token = jwt.sign(
      { id: newUser.id, email: email.toLowerCase(), name: name.trim(), role: 'field_agent', roles: ['field_agent'], org_id: 1 },
      JWT_SECRET, { expiresIn: '8h' }
    );
    res.status(201).json({ token, user: { id: newUser.id, email: email.toLowerCase(), name: name.trim(), role: 'field_agent', initials } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── FIELD: VENUES ─────────────────────────────────────────────
app.get('/api/field/venues', fieldAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM field.venues ORDER BY zone, name');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── FIELD: VISITS ─────────────────────────────────────────────
app.post('/api/field/visits', fieldAuth, async (req, res) => {
  const { venue_id, venue_name, status, notes } = req.body;
  if (!status) return res.status(400).json({ error: 'status es obligatorio' });
  try {
    const { rows: [visit] } = await pool.query(
      `INSERT INTO field.visits (venue_id, venue_name, agent_id, status, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [venue_id || null, venue_name || '', req.user.id, status, notes || '']
    );
    res.status(201).json({ ok: true, visit_id: visit.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── FIELD: CONTRACTS ──────────────────────────────────────────
app.post('/api/field/contracts/send', fieldAuth, async (req, res) => {
  const { doc_type, venue_id, venue_name, contract_data, signature_data_url } = req.body;
  if (!doc_type) return res.status(400).json({ error: 'doc_type es obligatorio' });
  const cd = contract_data || {};
  try {
    const { rows: [doc] } = await pool.query(
      `INSERT INTO field.contracts
         (venue_id,venue_name,doc_type,client_email,client_name,client_business,
          client_cif,plan,price,billing,signer_name,signature_data_url,signed_at,sent_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),$13) RETURNING id`,
      [venue_id || null, venue_name || cd.client_business || '',
       doc_type, cd.client_email || '', cd.client_name || '', cd.client_business || '',
       cd.client_cif || '', cd.plan || '', cd.price || '', cd.billing || '',
       cd.signer_name || '', signature_data_url || '', req.user.id]
    );
    res.status(201).json({ ok: true, doc_id: doc.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── FIELD: DEMOS ──────────────────────────────────────────────
app.post('/api/field/demos', fieldAuth, async (req, res) => {
  const { venue_id, venue_name, contact_name, contact_email, contact_phone, date, time, notes } = req.body;
  if (!contact_email || !date) return res.status(400).json({ error: 'contact_email y date son obligatorios' });
  try {
    const scheduledAt = new Date(`${date}T${time || '10:00'}:00`);
    const { rows: [demo] } = await pool.query(
      `INSERT INTO field.demos (venue_id,venue_name,contact_name,contact_email,contact_phone,scheduled_at,notes,agent_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [venue_id || null, venue_name || '', contact_name || '', contact_email, contact_phone || '', scheduledAt, notes || '', req.user.id]
    );
    await pool.query(
      `INSERT INTO crm.tasks (org_id,title,priority,due_at,assigned_to)
       VALUES (1,$1,'high',$2,$3)`,
      [`Demo PulseCosta — ${venue_name || contact_name}`, scheduledAt, req.user.id]
    );
    res.status(201).json({ ok: true, demo_id: demo.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── HEALTH ───────────────────────────────────────────────────
app.get('/api/crm/health', (_, res) =>
  res.json({ status: 'ok', version: '2.0-omnipulse', ts: new Date().toISOString() })
);

// ── START ────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`OmniPulse API v2.0 — puerto ${PORT}`);
  await migrateIfNeeded();
  await ensureVisitasTable();
  await ensureFieldTables();
});
