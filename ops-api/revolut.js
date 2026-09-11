// Revolut Business API (cuentas, transacciones, webhooks) + Merchant API (enlaces de pago).
// Config en ops.integraciones (proveedor='revolut'): { env, client_id, refresh_token, access_token, expires_at, merchant_secret, webhook_secret }
// Clave privada del certificado API en REVOLUT_PRIVATE_KEY_PATH (montada en el contenedor). Nunca se devuelve al cliente.
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const HOSTS = {
  sandbox: { api: 'https://sandbox-b2b.revolut.com', consent: 'https://sandbox-business.revolut.com/app-confirm', merchant: 'https://sandbox-merchant.revolut.com' },
  production: { api: 'https://b2b.revolut.com', consent: 'https://business.revolut.com/app-confirm', merchant: 'https://merchant.revolut.com' },
};
const ISSUER = process.env.REVOLUT_ISSUER || 'crm.pulsecosta.es';           // dominio del redirect URI registrado en Revolut
const REDIRECT_URI = process.env.REVOLUT_REDIRECT_URI || 'https://crm.pulsecosta.es/ops/bank/callback';
const KEY_PATH = process.env.REVOLUT_PRIVATE_KEY_PATH || '/run/secrets/revolut/privatekey.pem';

function privateKey() { return fs.existsSync(KEY_PATH) ? fs.readFileSync(KEY_PATH, 'utf8') : null; }
function clientAssertion(clientId) {
  const key = privateKey(); if (!key) throw new Error(`No hay clave privada en ${KEY_PATH}`);
  return jwt.sign({ iss: ISSUER, sub: clientId, aud: 'https://revolut.com' }, key, { algorithm: 'RS256', expiresIn: '10m' });
}

module.exports = function attachRevolut(app, pool, auth) {
  async function ensureTables() {
    await pool.query(`CREATE TABLE IF NOT EXISTS ops.integraciones (org_id INTEGER NOT NULL DEFAULT 1, proveedor TEXT NOT NULL, config JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (org_id, proveedor))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ops.banco_transacciones (
      id TEXT PRIMARY KEY, org_id INTEGER NOT NULL DEFAULT 1, cuenta_id TEXT, tipo TEXT, estado TEXT, importe NUMERIC(12,2), moneda TEXT,
      referencia TEXT, contraparte TEXT, fecha TIMESTAMPTZ, factura_id INTEGER, caja_id INTEGER, raw JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await pool.query(`ALTER TABLE ops.facturas ADD COLUMN IF NOT EXISTS enlace_pago TEXT, ADD COLUMN IF NOT EXISTS enlace_pago_id TEXT`);
  }
  async function getCfg(orgId) { const { rows } = await pool.query(`SELECT config FROM ops.integraciones WHERE org_id=$1 AND proveedor='revolut'`, [orgId]); return rows[0]?.config || {}; }
  async function setCfg(orgId, patch) {
    const cfg = { ...(await getCfg(orgId)), ...patch };
    await pool.query(`INSERT INTO ops.integraciones (org_id, proveedor, config) VALUES ($1,'revolut',$2) ON CONFLICT (org_id, proveedor) DO UPDATE SET config=$2, updated_at=now()`, [orgId, cfg]);
    return cfg;
  }
  const hosts = cfg => HOSTS[cfg.env === 'production' ? 'production' : 'sandbox'];
  const publicCfg = cfg => ({ env: cfg.env || 'sandbox', client_id: cfg.client_id || null, autorizado: !!cfg.refresh_token, merchant: !!cfg.merchant_secret, webhook: !!cfg.webhook_id, ultima_sync: cfg.ultima_sync || null, redirect_uri: REDIRECT_URI, issuer: ISSUER, clave_privada: !!privateKey() });

  async function token(orgId) {
    const cfg = await getCfg(orgId);
    if (!cfg.refresh_token) throw new Error('Revolut no autorizado');
    if (cfg.access_token && cfg.expires_at && Date.now() < cfg.expires_at - 60000) return cfg.access_token;
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: cfg.refresh_token, client_id: cfg.client_id, client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: clientAssertion(cfg.client_id) });
    const r = await fetch(`${hosts(cfg).api}/api/1.0/auth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const j = await r.json(); if (!r.ok) throw new Error(`Revolut token: ${j.error_description || j.error || r.status}`);
    await setCfg(orgId, { access_token: j.access_token, expires_at: Date.now() + (j.expires_in || 2400) * 1000 });
    return j.access_token;
  }
  async function api(orgId, path, opts = {}) {
    const cfg = await getCfg(orgId); const t = await token(orgId);
    const r = await fetch(`${hosts(cfg).api}${path}`, { ...opts, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    const text = await r.text(); let j; try { j = text ? JSON.parse(text) : null; } catch { j = text; }
    if (!r.ok) throw new Error(`Revolut ${path}: ${r.status} ${typeof j === 'object' ? (j?.message || JSON.stringify(j)) : j}`);
    return j;
  }
  // Guarda una transacción y la concilia por referencia (número de factura) o por importe exacto pendiente
  async function upsertTx(orgId, tx) {
    const leg = (tx.legs && tx.legs[0]) || {};
    const importe = Number(leg.amount ?? tx.amount ?? 0); const referencia = tx.reference || leg.description || null;
    const contraparte = leg.counterparty?.account_id || tx.merchant?.name || leg.counterparty?.id || null;
    await pool.query(`INSERT INTO ops.banco_transacciones (id, org_id, cuenta_id, tipo, estado, importe, moneda, referencia, contraparte, fecha, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO UPDATE SET estado=EXCLUDED.estado, importe=EXCLUDED.importe, referencia=EXCLUDED.referencia, raw=EXCLUDED.raw`,
      [tx.id, orgId, leg.account_id || null, tx.type || null, tx.state || null, importe, leg.currency || tx.currency || 'EUR', referencia, contraparte, tx.created_at || tx.completed_at || new Date().toISOString(), tx]);
    if (importe > 0 && tx.state === 'completed') await autoConciliar(orgId, tx.id, importe, referencia);
  }
  async function autoConciliar(orgId, txId, importe, referencia) {
    const ya = await pool.query('SELECT factura_id FROM ops.banco_transacciones WHERE id=$1', [txId]); if (ya.rows[0]?.factura_id) return;
    const m = referencia && referencia.match(/\b(20\d{2}-\d{3,})\b/);
    const { rows } = await pool.query(
      `SELECT id, numero, total FROM ops.facturas WHERE org_id=$1 AND estado IN ('enviada','vencida') AND ($2::text IS NOT NULL AND numero=$2 OR ABS(total-$3) < 0.005) ORDER BY (numero=$2) DESC, fecha_emision LIMIT 1`,
      [orgId, m ? m[1] : null, importe]);
    if (rows.length) await conciliar(orgId, txId, rows[0].id, null);
  }
  async function conciliar(orgId, txId, facturaId, userId) {
    const f = (await pool.query('SELECT * FROM ops.facturas WHERE id=$1 AND org_id=$2', [facturaId, orgId])).rows[0]; if (!f) throw new Error('Factura no encontrada');
    const tx = (await pool.query('SELECT * FROM ops.banco_transacciones WHERE id=$1', [txId])).rows[0]; if (!tx) throw new Error('Transacción no encontrada');
    await pool.query('BEGIN');
    try {
      await pool.query(`UPDATE ops.facturas SET estado='cobrada', metodo_pago='Revolut' WHERE id=$1`, [facturaId]);
      const caja = await pool.query(`INSERT INTO ops.caja_movimientos (org_id,tipo,concepto,importe,tipo_iva,iva_rate,iva_importe,fecha,categoria,cliente_id,factura_id,notas)
        VALUES ($1,'ingreso',$2,$3,$4,$5,$6,$7,'Invoice',$8,$9,$10) RETURNING id`,
        [orgId, `Factura ${f.numero} (Revolut)`, Number(tx.importe), f.tipo_iva, f.iva_rate, f.iva_importe, String(tx.fecha).slice(0, 10), f.cliente_id, facturaId, `Conciliado con transacción Revolut ${txId}`]);
      await pool.query('UPDATE ops.banco_transacciones SET factura_id=$1, caja_id=$2 WHERE id=$3', [facturaId, caja.rows[0].id, txId]);
      await pool.query('COMMIT');
    } catch (e) { await pool.query('ROLLBACK'); throw e; }
  }

  // ── Webhook (sin auth: lo llama Revolut). Verifica firma si hay secreto.
  app.post('/api/ops/banco/webhook', async (req, res) => {
    try {
      const orgId = 1; const cfg = await getCfg(orgId);
      if (cfg.webhook_secret) {
        const sig = req.get('Revolut-Signature') || ''; const ts = req.get('Revolut-Request-Timestamp') || '';
        const payload = `v1.${ts}.${JSON.stringify(req.body)}`;
        const expected = 'v1=' + crypto.createHmac('sha256', cfg.webhook_secret).update(payload).digest('hex');
        if (!sig.split(',').some(s => s.trim() === expected)) return res.status(401).json({ error: 'firma inválida' });
      }
      const ev = req.body || {};
      if (ev.event === 'TransactionCreated' || ev.event === 'TransactionStateChanged') {
        const id = ev.data?.id; if (id) { try { const tx = await api(orgId, `/api/1.0/transaction/${id}`); await upsertTx(orgId, tx); } catch (e) { console.error('[revolut webhook]', e.message); } }
      }
      res.json({ ok: true });
    } catch (err) { console.error('[revolut webhook]', err.message); res.status(500).json({ error: 'error' }); }
  });

  app.get('/api/ops/banco/estado', auth, async (req, res) => { try { res.json(publicCfg(await getCfg(req.user.org_id || 1))); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.post('/api/ops/banco/config', auth, async (req, res) => {
    if (!req.user.roles?.includes('super_admin')) return res.status(403).json({ error: 'Solo super_admin' });
    const patch = {}; for (const k of ['env', 'client_id', 'merchant_secret', 'webhook_secret']) if (req.body[k] !== undefined && req.body[k] !== '') patch[k] = req.body[k];
    if (req.body.desautorizar) { patch.refresh_token = null; patch.access_token = null; }
    try { res.json(publicCfg(await setCfg(req.user.org_id || 1, patch))); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/ops/banco/autorizar-url', auth, async (req, res) => {
    const cfg = await getCfg(req.user.org_id || 1); if (!cfg.client_id) return res.status(400).json({ error: 'Falta client_id' });
    res.json({ url: `${hosts(cfg).consent}?client_id=${encodeURIComponent(cfg.client_id)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code` });
  });
  app.post('/api/ops/banco/autorizar', auth, async (req, res) => {
    try {
      const orgId = req.user.org_id || 1; const cfg = await getCfg(orgId); const { code } = req.body; if (!code) return res.status(400).json({ error: 'Falta code' });
      const body = new URLSearchParams({ grant_type: 'authorization_code', code, client_id: cfg.client_id, client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: clientAssertion(cfg.client_id) });
      const r = await fetch(`${hosts(cfg).api}/api/1.0/auth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      const j = await r.json(); if (!r.ok) return res.status(400).json({ error: j.error_description || j.error || `HTTP ${r.status}` });
      await setCfg(orgId, { refresh_token: j.refresh_token, access_token: j.access_token, expires_at: Date.now() + (j.expires_in || 2400) * 1000 });
      res.json(publicCfg(await getCfg(orgId)));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/ops/banco/cuentas', auth, async (req, res) => { try { res.json(await api(req.user.org_id || 1, '/api/1.0/accounts')); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get('/api/ops/banco/transacciones', auth, async (req, res) => {
    try {
      const orgId = req.user.org_id || 1; const q = new URLSearchParams({ count: '200' });
      if (req.query.desde) q.set('from', `${req.query.desde}T00:00:00Z`); if (req.query.hasta) q.set('to', `${req.query.hasta}T23:59:59Z`);
      const txs = await api(orgId, `/api/1.0/transactions?${q}`);
      for (const tx of txs) await upsertTx(orgId, tx);
      await setCfg(orgId, { ultima_sync: new Date().toISOString() });
      const { rows } = await pool.query(`SELECT b.*, f.numero AS factura_numero FROM ops.banco_transacciones b LEFT JOIN ops.facturas f ON f.id=b.factura_id WHERE b.org_id=$1 ORDER BY b.fecha DESC LIMIT 300`, [orgId]);
      res.json(rows);
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  app.post('/api/ops/banco/conciliar', auth, async (req, res) => {
    try { await conciliar(req.user.org_id || 1, req.body.tx_id, req.body.factura_id, req.user.id); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.post('/api/ops/banco/webhook/registrar', auth, async (req, res) => {
    if (!req.user.roles?.includes('super_admin')) return res.status(403).json({ error: 'Solo super_admin' });
    try {
      const orgId = req.user.org_id || 1; const url = process.env.REVOLUT_WEBHOOK_URL || 'https://crm.pulsecosta.es/api/ops/banco/webhook';
      const j = await api(orgId, '/api/2.0/webhooks', { method: 'POST', body: JSON.stringify({ url, events: ['TransactionCreated', 'TransactionStateChanged'] }) });
      await setCfg(orgId, { webhook_id: j.id, webhook_secret: j.signing_secret || null });
      res.json({ ok: true, id: j.id });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  // Enlace de pago (Merchant API) para una factura: se guarda en la factura y se incluye en el PDF/email
  app.post('/api/ops/facturas/:id/enlace-pago', auth, async (req, res) => {
    try {
      const orgId = req.user.org_id || 1; const cfg = await getCfg(orgId); if (!cfg.merchant_secret) return res.status(400).json({ error: 'Falta la clave secreta de Merchant API en Banco' });
      const f = (await pool.query(`SELECT f.*, c.email AS cliente_email, c.nombre AS cliente_nombre FROM ops.facturas f LEFT JOIN ops.clientes c ON c.id=f.cliente_id WHERE f.id=$1 AND f.org_id=$2`, [req.params.id, orgId])).rows[0];
      if (!f) return res.status(404).json({ error: 'Factura no encontrada' });
      if (f.enlace_pago) return res.json({ url: f.enlace_pago, id: f.enlace_pago_id });
      const r = await fetch(`${hosts(cfg).merchant}/api/orders`, { method: 'POST', headers: { Authorization: `Bearer ${cfg.merchant_secret}`, 'Content-Type': 'application/json', 'Revolut-Api-Version': '2024-09-01' },
        body: JSON.stringify({ amount: Math.round(Number(f.total) * 100), currency: 'EUR', description: `Factura ${f.numero} · PulseCosta`, merchant_order_ext_ref: f.numero, customer: f.cliente_email ? { email: f.cliente_email, full_name: f.cliente_nombre } : undefined, redirect_url: 'https://pulsecosta.es/gracias' }) });
      const j = await r.json(); if (!r.ok) return res.status(502).json({ error: j.message || `Merchant HTTP ${r.status}` });
      await pool.query('UPDATE ops.facturas SET enlace_pago=$1, enlace_pago_id=$2 WHERE id=$3', [j.checkout_url, j.id, f.id]);
      res.json({ url: j.checkout_url, id: j.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return { ensureTables };
};
