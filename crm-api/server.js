require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

function gemini() {
  if (!genAI) throw new Error('GEMINI_API_KEY no configurada');
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
}

const app        = express();
const PORT       = process.env.PORT || 3010;
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
    const [accounts, leads, tasks, demos] = await Promise.all([
      pool.query('SELECT stage, mrr FROM crm.accounts WHERE org_id = $1', [orgId]),
      pool.query('SELECT stage FROM crm.leads WHERE org_id = $1', [orgId]),
      pool.query('SELECT done FROM crm.tasks WHERE org_id = $1', [orgId]),
      // Próximas demos de PulseField (opcional — no falla si la tabla no existe)
      pool.query(`
        SELECT fv.id, fv.venue_name, fv.zone, fv.scheduled_at, fv.status,
               fa.name AS agent_name
        FROM public.field_visits fv
        LEFT JOIN public.field_agents fa ON fa.id = fv.agent_id
        WHERE fv.status = 'scheduled'
          AND fv.scheduled_at >= NOW()
        ORDER BY fv.scheduled_at ASC
        LIMIT 5
      `).catch(() => ({ rows: [] })),  // silencia error si tabla no existe
    ]);
    const active = accounts.rows.filter(a => a.stage === 'active');
    res.json({
      mrr:            active.reduce((s, a) => s + Number(a.mrr), 0),
      activeAccounts: active.length,
      totalLeads:     leads.rows.length,
      pendingTasks:   tasks.rows.filter(t => !t.done).length,
      upcomingDemos:  demos.rows,
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
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
});

app.put('/api/ops/facturas/:id', auth, async (req, res) => {
  const VALID_ESTADOS = ['draft','sent','collected','overdue','cancelled'];
  if (req.body.estado !== undefined && !VALID_ESTADOS.includes(req.body.estado))
    return res.status(400).json({ error: `Estado inválido. Valores permitidos: ${VALID_ESTADOS.join(', ')}` });
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


// ── AI: GEMINI ASSISTANT ─────────────────────────────────────

// POST /api/ai/crm/daily-summary  — "¿qué hemos hecho hoy?"
app.post('/api/ai/crm/daily-summary', auth, async (req, res) => {
  try {
    const orgId = req.user.org_id || 1;
    const date  = req.body.date || new Date().toISOString().split('T')[0];

    const [activities, fieldVisits, tasks] = await Promise.all([
      pool.query(`
        SELECT a.type, a.description, u.name AS agent, ac.name AS account
        FROM crm.activities a
        LEFT JOIN core.users u   ON u.id = a.agent_id
        LEFT JOIN crm.accounts ac ON ac.id = a.account_id
        WHERE a.org_id = $1 AND DATE(a.created_at AT TIME ZONE 'Europe/Madrid') = $2
        ORDER BY a.created_at DESC LIMIT 50
      `, [orgId, date]),
      pool.query(`
        SELECT v.venue_name, v.status, v.notes, u.name AS agent
        FROM field.visits v
        LEFT JOIN core.users u ON u.id = v.agent_id
        WHERE DATE(v.visited_at AT TIME ZONE 'Europe/Madrid') = $1
        ORDER BY v.visited_at DESC LIMIT 50
      `, [date]),
      pool.query(`
        SELECT t.title, t.priority, u.name AS assigned_to, t.done
        FROM crm.tasks t
        LEFT JOIN core.users u ON u.id = t.assigned_to
        WHERE t.org_id = $1 AND DATE(t.due_at AT TIME ZONE 'Europe/Madrid') = $2
        ORDER BY t.done ASC, t.priority DESC LIMIT 30
      `, [orgId, date]),
    ]);

    const ctx = [
      `Fecha: ${date}`,
      `\nACTIVIDADES CRM (${activities.rows.length}):`,
      activities.rows.length
        ? activities.rows.map(a => `- ${a.agent}: [${a.type}] ${a.description}${a.account ? ` → ${a.account}` : ''}`).join('\n')
        : '  Sin actividades registradas',
      `\nVISITAS DE CAMPO (${fieldVisits.rows.length}):`,
      fieldVisits.rows.length
        ? fieldVisits.rows.map(v => `- ${v.agent}: "${v.venue_name}" → ${v.status}${v.notes ? ` (${v.notes})` : ''}`).join('\n')
        : '  Sin visitas registradas',
      `\nTAREAS DEL DÍA (${tasks.rows.length}):`,
      tasks.rows.length
        ? tasks.rows.map(t => `- [${t.done ? '✓' : 'pendiente'}] ${t.title} (${t.priority}) → ${t.assigned_to}`).join('\n')
        : '  Sin tareas',
    ].join('\n');

    const prompt = `Eres el asistente interno de PulseCosta, startup de ocio en tiempo real en la Costa del Sol (España).
El equipo comercial lo forman: Cipriano (CEO/técnico), Heidi (COO/finanzas), Sergio y Jota (agentes de campo).
Analiza los datos del día y genera un resumen ejecutivo en español. Sé directo y destaca:
1. Lo más importante realizado
2. Estado de las visitas comerciales
3. Tareas pendientes críticas
4. Una valoración rápida del día

Datos:\n${ctx}`;

    const result = await gemini().generateContent(prompt);
    res.json({
      summary: result.response.text(),
      meta: { date, activities: activities.rows.length, visits: fieldVisits.rows.length, tasks: tasks.rows.length },
    });
  } catch (err) {
    console.error('[AI daily-summary]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/crm/visit-analysis  — "¿cómo han ido las visitas?"
app.post('/api/ai/crm/visit-analysis', auth, async (req, res) => {
  try {
    const date  = req.body.date  || new Date().toISOString().split('T')[0];
    const agent = req.body.agent || null;

    let q = `
      SELECT v.venue_name, v.status, v.notes, v.doc_sent, u.name AS agent, v.visited_at
      FROM field.visits v
      LEFT JOIN core.users u ON u.id = v.agent_id
      WHERE DATE(v.visited_at AT TIME ZONE 'Europe/Madrid') = $1
    `;
    const p = [date];
    if (agent) { p.push(agent); q += ` AND u.name ILIKE $${p.length}`; }
    q += ' ORDER BY v.visited_at DESC';

    const { rows } = await pool.query(q, p);

    if (!rows.length) return res.json({ summary: `No hay visitas registradas para el ${date}${agent ? ` de ${agent}` : ''}.`, meta: { date, total: 0 } });

    const stats = rows.reduce((acc, v) => {
      acc[v.status] = (acc[v.status] || 0) + 1;
      return acc;
    }, {});

    const ctx = rows.map(v =>
      `- ${v.agent} visitó "${v.venue_name}" a las ${new Date(v.visited_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} → estado: ${v.status}${v.doc_sent ? ` | doc: ${v.doc_sent}` : ''}${v.notes ? ` | notas: ${v.notes}` : ''}`
    ).join('\n');

    const prompt = `Eres el asistente comercial de PulseCosta. Analiza las visitas del día y genera un informe en español con:
1. Resumen general (cuántas visitas, resultados)
2. Destacados positivos
3. Oportunidades o seguimientos pendientes
4. Recomendación para mañana

Fecha: ${date}
Estadísticas: ${JSON.stringify(stats)}
Detalle visitas:\n${ctx}`;

    const result = await gemini().generateContent(prompt);
    res.json({
      summary: result.response.text(),
      meta: { date, total: rows.length, stats },
    });
  } catch (err) {
    console.error('[AI visit-analysis]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/ask  — pregunta libre sobre datos CRM/OPS
app.post('/api/ai/ask', auth, async (req, res) => {
  try {
    const { question, context: extraCtx } = req.body;
    if (!question) return res.status(400).json({ error: 'question es obligatorio' });

    const orgId = req.user.org_id || 1;
    const [accounts, leads] = await Promise.all([
      pool.query(`SELECT name, plan, stage, zone, mrr FROM crm.accounts WHERE org_id = $1 AND stage = 'active' LIMIT 20`, [orgId]),
      pool.query(`SELECT name, type, zone, stage FROM crm.leads WHERE org_id = $1 ORDER BY created_at DESC LIMIT 10`, [orgId]),
    ]);

    const ctx = [
      `Cuentas activas (${accounts.rows.length}): ${accounts.rows.map(a => `${a.name} (${a.plan}, ${a.zone}, MRR: €${a.mrr})`).join('; ')}`,
      `Leads recientes (${leads.rows.length}): ${leads.rows.map(l => `${l.name} (${l.type}, ${l.stage})`).join('; ')}`,
      extraCtx ? `\nContexto adicional: ${extraCtx}` : '',
    ].join('\n');

    const prompt = `Eres el asistente interno de PulseCosta (startup de ocio en tiempo real, Costa del Sol, empresa OÜ Estonia).
El usuario es ${req.user.name} (${req.user.role}).
Responde en español de forma concisa y útil.

Datos disponibles:\n${ctx}

Pregunta: ${question}`;

    const result = await gemini().generateContent(prompt);
    res.json({ answer: result.response.text() });
  } catch (err) {
    console.error('[AI ask]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── AI: OPS ENDPOINTS ────────────────────────────────────────

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
        WHERE f.org_id = $1 AND f.estado = 'pending' AND f.fecha_vencimiento < NOW()
        ORDER BY f.fecha_vencimiento ASC
      `, [orgId]),
    ]);

    const totalFacturado = facturas.rows.reduce((s, f) => s + Number(f.total), 0);
    const totalCobrado   = facturas.rows.filter(f => f.estado === 'paid').reduce((s, f) => s + Number(f.total), 0);
    const totalPendiente = facturas.rows.filter(f => f.estado === 'pending').reduce((s, f) => s + Number(f.total), 0);
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

    const result = await gemini().generateContent(prompt);
    res.json({
      summary: result.response.text(),
      meta: { dateFrom, dateTo, totalFacturado, totalCobrado, totalPendiente, totalIVA, overdueCount: overdue.rows.length },
    });
  } catch (err) {
    console.error('[AI ops/billing]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/ops/accountant-report  — informe para gestor (PDF/email)
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

    const result = await gemini().generateContent(prompt);
    res.json({
      report: result.response.text(),
      meta: { month, year, dateFrom, dateTo, ingresos, gastos, resultado: ingresos - gastos, ivaRep, ivaIntra, facturas: facturas.rows.length },
    });
  } catch (err) {
    console.error('[AI ops/accountant-report]', err.message);
    res.status(500).json({ error: err.message });
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
      `, [since]),
      pool.query(`
        SELECT name, plan, stage, mrr, zone FROM crm.accounts
        WHERE org_id = 1 AND stage = 'active'
        ORDER BY mrr DESC LIMIT 20
      `, []),
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

    const result = await gemini().generateContent(prompt);
    res.json({
      summary: result.response.text(),
      meta: { since, total: contracts.rows.length, byPlan, mrrActive: mrr },
    });
  } catch (err) {
    console.error('[AI ops/contracts-review]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/ops/heidi  — asistente de Heidi (clientes + fiscal)
app.post('/api/ai/ops/heidi', auth, async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'question es obligatorio' });

    const orgId = req.user.org_id || 1;
    const [clientes, facturasPending, accounts] = await Promise.all([
      pool.query(`
        SELECT c.nombre, c.pais, c.tipo_cliente, c.vat_number, c.email, c.contacto,
               COUNT(f.id) AS num_facturas,
               SUM(CASE WHEN f.estado = 'pending' THEN f.total ELSE 0 END) AS deuda_pendiente
        FROM ops.clientes c
        LEFT JOIN ops.facturas f ON f.cliente_id = c.id AND f.org_id = c.org_id
        WHERE c.org_id = $1 AND c.activo = true
        GROUP BY c.id ORDER BY c.nombre
      `, [orgId]),
      pool.query(`
        SELECT f.numero, f.total, f.fecha_vencimiento, f.estado, c.nombre AS cliente, c.pais, c.email AS cliente_email
        FROM ops.facturas f
        LEFT JOIN ops.clientes c ON c.id = f.cliente_id
        WHERE f.org_id = $1 AND f.estado IN ('pending','overdue')
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

Pregunta de Heidi: ${question}

Responde en español de forma precisa y práctica. Si es una consulta fiscal, sé específico con las obligaciones de Estonia OÜ y las reglas UE aplicables.`;

    const result = await gemini().generateContent(prompt);
    res.json({ answer: result.response.text() });
  } catch (err) {
    console.error('[AI ops/heidi]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── AI: PWA IMAGE MODERATION ─────────────────────────────────

// POST /api/ai/pwa/moderate-image
// Body: { imageBase64: string, mimeType: string }
// Returns: { approved: boolean, reason: string, message: string, score: number }
app.post('/api/ai/pwa/moderate-image', auth, async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 es obligatorio' });

    const model = gemini();
    const prompt = `Eres el moderador de imágenes de PulseCosta, una app de ocio en la Costa del Sol.
Los negocios (bares, restaurantes, hoteles, clubs) suben fotos de su local para su perfil público.

Analiza esta imagen y evalúa si es apta para publicar como foto de portada de un negocio.

Criterios de rechazo (devuelve approved=false si alguno aplica):
1. CALIDAD: imagen borrosa, pixelada, muy baja resolución, comprimida en exceso
2. ILUMINACIÓN: demasiado oscura (apenas se ve el local), sobreexpuesta (quemada), con flash duro
3. CONTENIDO: no muestra un local/negocio (ej: selfie, documento, pantalla, naturaleza sin local)
4. INAPROPIADO: contenido ofensivo, político, o que no corresponde a hostelería/ocio

Si la imagen es aceptable (aunque no perfecta), apruébala.

Responde ÚNICAMENTE con JSON válido, sin explicaciones adicionales:
{
  "approved": true/false,
  "score": 0-100,
  "reason": "ok" | "low_quality" | "bad_lighting" | "wrong_content" | "inappropriate",
  "message_es": "mensaje corto en español para mostrar al usuario (max 120 chars)",
  "message_en": "short message in English for the user (max 120 chars)"
}`;

    const result = await model.generateContent([
      { inlineData: { data: imageBase64, mimeType } },
      prompt,
    ]);

    const raw = result.response.text().trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Gemini no devolvió JSON válido');
    const verdict = JSON.parse(jsonMatch[0]);

    res.json({
      approved:   !!verdict.approved,
      score:      verdict.score ?? 50,
      reason:     verdict.reason || 'ok',
      message:    verdict.message_es || (verdict.approved ? 'Imagen aceptada ✓' : 'Imagen rechazada'),
      message_en: verdict.message_en || (verdict.approved ? 'Image accepted ✓' : 'Image rejected'),
    });
  } catch (err) {
    console.error('[AI pwa/moderate-image]', err.message);
    // En caso de error de Gemini, aprobamos para no bloquear al usuario
    res.json({ approved: true, score: 50, reason: 'error', message: 'Moderación no disponible, imagen aceptada', message_en: 'Moderation unavailable, image accepted' });
  }
});

// ── PROMO CODE VALIDATION ─────────────────────────────────────
// POST /api/promo/validate  { code: string, plan?: string }
app.post('/api/promo/validate', auth, (req, res) => {
  const { code } = req.body || {};
  const validCodes = (process.env.PROMO_CODES || 'pulse2026').split(',').map(s => s.trim().toLowerCase());
  const valid = typeof code === 'string' && validCodes.includes(code.trim().toLowerCase());
  res.json({ valid });
});

// ── DEEPL TRANSLATE ─────────────────────────────────────────
app.post('/api/translate', auth, async (req, res) => {
  const { texts, target = 'EN-GB' } = req.body;
  if (!Array.isArray(texts) || texts.length === 0)
    return res.status(400).json({ error: 'texts[] requerido' });
  const key = process.env.DEEPL_API_KEY;
  if (!key) return res.status(503).json({ error: 'Servicio de traducción no configurado' });
  try {
    const params = new URLSearchParams();
    texts.forEach(t => params.append('text', t));
    params.append('target_lang', target);
    const r = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: { 'Authorization': `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!r.ok) throw new Error(`DeepL ${r.status}`);
    const data = await r.json();
    res.json({ translations: data.translations });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── HEALTH ───────────────────────────────────────────────────
app.get('/api/crm/health', async (_, res) => {
  const health = { status: 'ok', api: 'ok', db: 'ok', disk_pct: 0, version: '2.0-omnipulse', ts: new Date().toISOString() };
  try { await pool.query('SELECT 1'); } catch { health.db = 'error'; health.status = 'degraded'; }
  try {
    const { execSync } = require('child_process');
    const pct = execSync("df / | tail -1 | awk '{print $5}'").toString().trim().replace('%','');
    health.disk_pct = parseInt(pct) || 0;
    if (health.disk_pct > 85) health.status = 'degraded';
  } catch { }
  res.json(health);
});

// ── START ────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`OmniPulse API v2.0 — puerto ${PORT}`);
  // migrateIfNeeded() DESACTIVADA a propósito (07/08/2026).
  //
  // Copiaba public.crm_* → crm.* en cada arranque del contenedor. Se apaga por
  // dos motivos:
  //
  // 1. Contradice la decisión de arquitectura del 06/08: NO se migra el legado.
  //    Lo nuevo se construye directamente en los esquemas limpios (crm.*, ops.*,
  //    pwa.*, accounting.*) y public.* sigue sirviendo a la PWA hasta que le
  //    toque. Migrar primero es el camino caro.
  //
  // 2. Migrar datos es una decisión, no un efecto secundario de reiniciar un
  //    contenedor. Hoy solo la frena que public.crm_leads.type vale
  //    'bar_restaurante' y crm.leads tiene CHECK (type IN ('local','hotel')).
  //    El día que alguien "arregle" ese mapeo, el siguiente reinicio migraría
  //    los datos sin que nadie lo haya pedido.
  //
  // La función se conserva por si algún día se hace la migración de verdad:
  // entonces se ejecuta a mano, con respaldo y revisando el mapeo de tipos.
  await ensureVisitasTable();
});
