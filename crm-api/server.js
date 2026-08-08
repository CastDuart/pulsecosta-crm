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
});
