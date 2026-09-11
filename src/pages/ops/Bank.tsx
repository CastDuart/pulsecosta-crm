import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/opsFetch';
import { formatEur, formatDate } from '../../lib/iva';
import type { Factura } from '../../types';
import { RefreshCw, Link2, ShieldCheck } from 'lucide-react';

// Banco (Revolut Business): configuración, autorización, saldos, transacciones y conciliación con facturas.
type Estado = { env: 'sandbox' | 'production'; client_id: string | null; autorizado: boolean; merchant: boolean; webhook: boolean; ultima_sync: string | null; redirect_uri: string; issuer: string; clave_privada: boolean };
type Cuenta = { id: string; name: string; balance: number; currency: string; state: string };
type Tx = { id: string; tipo: string; estado: string; importe: number; moneda: string; referencia?: string; contraparte?: string; fecha: string; factura_id?: number; factura_numero?: string };
const card: React.CSSProperties = { background: 'var(--ivory-alt)', borderRadius: 12, border: '1px solid var(--linea)', overflow: 'hidden' };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', color: 'var(--muted)', fontWeight: 500, fontSize: 12, borderBottom: '1px solid var(--linea)' };
const td: React.CSSProperties = { padding: '9px 14px', fontSize: 13, borderBottom: '1px solid var(--linea)' };
const mono: React.CSSProperties = { fontFamily: 'JetBrains Mono, monospace' };
const input: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--linea)', background: 'var(--ivory)', color: 'var(--ink)', width: '100%' };
const btn = (primary = false): React.CSSProperties => ({ padding: '8px 14px', borderRadius: 8, border: primary ? 'none' : '1px solid var(--linea)', background: primary ? 'var(--pulse)' : 'none', color: primary ? 'var(--petrol)' : 'var(--muted)', cursor: 'pointer', fontSize: 12, fontWeight: 700 });

export default function Bank() {
  const [params] = useSearchParams(); const navigate = useNavigate();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [pendientes, setPendientes] = useState<Factura[]>([]);
  const [form, setForm] = useState({ env: 'sandbox', client_id: '', merchant_secret: '' });
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);

  const loadEstado = () => apiFetch<Estado>('/ops/banco/estado').then(e => { setEstado(e); setForm(f => ({ ...f, env: e.env, client_id: e.client_id || '' })); });
  const loadDatos = async () => {
    setBusy(true); setMsg('');
    try {
      const [c, t, f] = await Promise.all([apiFetch<Cuenta[]>('/ops/banco/cuentas'), apiFetch<Tx[]>('/ops/banco/transacciones'), apiFetch<Factura[]>('/ops/facturas')]);
      setCuentas(c); setTxs(t); setPendientes(f.filter(x => ['enviada', 'vencida'].includes(x.estado)));
    } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };
  useEffect(() => { loadEstado(); }, []);
  useEffect(() => { if (estado?.autorizado) loadDatos(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [estado?.autorizado]);
  // Vuelta del consentimiento de Revolut: /ops/bank/callback?code=...
  useEffect(() => {
    const code = params.get('code'); if (!code) return;
    setBusy(true);
    apiFetch<Estado>('/ops/banco/autorizar', { method: 'POST', body: JSON.stringify({ code }) })
      .then(e => { setEstado(e); setMsg('Revolut autorizado correctamente.'); navigate('/ops/bank', { replace: true }); })
      .catch(e => setMsg(String(e))).finally(() => setBusy(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardar = async () => {
    setBusy(true); setMsg('');
    try { setEstado(await apiFetch<Estado>('/ops/banco/config', { method: 'POST', body: JSON.stringify(form) })); setMsg('Configuración guardada.'); setForm(f => ({ ...f, merchant_secret: '' })); }
    catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };
  const autorizar = async () => { try { const { url } = await apiFetch<{ url: string }>('/ops/banco/autorizar-url'); window.location.href = url; } catch (e) { setMsg(String(e)); } };
  const registrarWebhook = async () => { setBusy(true); try { await apiFetch('/ops/banco/webhook/registrar', { method: 'POST' }); await loadEstado(); setMsg('Webhook registrado: las nuevas transacciones llegarán en tiempo real.'); } catch (e) { setMsg(String(e)); } finally { setBusy(false); } };
  const conciliar = async (tx: Tx, facturaId: number) => { setBusy(true); try { await apiFetch('/ops/banco/conciliar', { method: 'POST', body: JSON.stringify({ tx_id: tx.id, factura_id: facturaId }) }); await loadDatos(); } catch (e) { setMsg(String(e)); } finally { setBusy(false); } };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>Banco · Revolut Business</h1>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Saldos y movimientos en tiempo real, conciliación con facturas y enlaces de pago</div>
        </div>
        {estado?.autorizado && <button onClick={loadDatos} disabled={busy} style={btn()}><RefreshCw size={13} style={{ verticalAlign: -2 }} /> Sincronizar</button>}
      </div>
      {msg && <div style={{ marginBottom: 12, fontSize: 13, color: /correcta|guardad|registrad/.test(msg) ? 'var(--verde-text)' : 'var(--rojo-text)' }}>{msg}</div>}

      {estado && !estado.autorizado && (
        <div style={{ ...card, padding: 20, marginBottom: 16, maxWidth: 760 }}>
          <div style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}><ShieldCheck size={15} style={{ verticalAlign: -2 }} /> Conectar Revolut Business</div>
          <ol style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, paddingLeft: 18, marginTop: 0 }}>
            <li>En Revolut Business web: <b>Settings → APIs → Business API → Add certificate</b>. Pega el certificado público que te ha dado Claude, y como <b>redirect URL</b> pon <code>{estado.redirect_uri}</code>.</li>
            <li>Copia el <b>Client ID</b> que te muestra Revolut y pégalo aquí. Elige <b>sandbox</b> para probar o <b>producción</b> para la cuenta real.</li>
            <li>Pulsa <b>Autorizar en Revolut</b>: te pedirá confirmar en la app y volverás aquí conectado.</li>
            <li>Opcional: la <b>clave secreta de Merchant API</b> (Settings → APIs → Merchant API) para generar enlaces de pago en las facturas.</li>
          </ol>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10, alignItems: 'center', marginTop: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Entorno</label>
            <select value={form.env} onChange={e => setForm({ ...form, env: e.target.value })} style={{ ...input, width: 220 }}><option value="sandbox">Sandbox (pruebas)</option><option value="production">Producción</option></select>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Client ID</label>
            <input value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} placeholder="Client ID del certificado en Revolut" style={input} autoComplete="off" name="revolut_client_id" />
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Merchant API (opcional)</label>
            <input type="password" value={form.merchant_secret} onChange={e => setForm({ ...form, merchant_secret: e.target.value })} placeholder={estado.merchant ? 'Guardada · pega otra para sustituir' : 'sk_…'} style={input} autoComplete="new-password" name="revolut_merchant_secret" />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={guardar} disabled={busy} style={btn()}>Guardar</button>
            <button onClick={autorizar} disabled={busy || !estado.client_id || !estado.clave_privada} style={btn(true)}>Autorizar en Revolut</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
            Clave privada en el servidor: {estado.clave_privada ? 'sí' : 'no encontrada'} · Emisor JWT: {estado.issuer}
          </div>
        </div>
      )}

      {estado?.autorizado && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            {cuentas.map(c => (
              <div key={c.id} style={{ ...card, padding: '14px 18px', minWidth: 200 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.name || 'Cuenta'} · {c.currency}</div>
                <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{c.currency === 'EUR' ? formatEur(Number(c.balance)) : `${Number(c.balance).toFixed(2)} ${c.currency}`}</div>
              </div>
            ))}
            <div style={{ ...card, padding: '14px 18px', minWidth: 220 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Estado</div>
              <div style={{ fontSize: 13, color: 'var(--ink)' }}>{estado.env === 'production' ? 'Producción' : 'Sandbox'} · webhook {estado.webhook ? 'activo' : 'no'} · Merchant {estado.merchant ? 'sí' : 'no'}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Última sync: {estado.ultima_sync ? new Date(estado.ultima_sync).toLocaleString('es-ES') : '—'}</div>
              {!estado.webhook && <button onClick={registrarWebhook} disabled={busy} style={{ ...btn(), marginTop: 8 }}>Activar tiempo real (webhook)</button>}
            </div>
          </div>
          <div style={card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Fecha', 'Referencia', 'Contraparte', 'Importe', 'Estado', 'Factura'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {txs.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--muted)', padding: 22 }}>Sin transacciones sincronizadas</td></tr>}
                {txs.map(t => (
                  <tr key={t.id}>
                    <td style={{ ...td, ...mono, color: 'var(--muted)' }}>{formatDate(t.fecha)}</td>
                    <td style={{ ...td, color: 'var(--ink)' }}>{t.referencia || '—'}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{t.contraparte || '—'}</td>
                    <td style={{ ...td, ...mono, fontWeight: 700, color: Number(t.importe) >= 0 ? 'var(--verde-text)' : 'var(--rojo-text)' }}>{formatEur(Number(t.importe))}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{t.estado}</td>
                    <td style={td}>
                      {t.factura_numero ? <span style={{ color: 'var(--verde-text)', fontWeight: 700 }}><Link2 size={12} style={{ verticalAlign: -2 }} /> {t.factura_numero}</span>
                        : Number(t.importe) > 0 && pendientes.length > 0 ? (
                          <select defaultValue="" onChange={e => { if (e.target.value) conciliar(t, Number(e.target.value)); }} style={{ ...input, width: 'auto', padding: '4px 8px', fontSize: 12 }}>
                            <option value="">Conciliar con…</option>
                            {pendientes.map(f => <option key={f.id} value={f.id}>{f.numero} · {f.cliente_nombre} · {formatEur(f.total)}</option>)}
                          </select>
                        ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12 }}><button onClick={() => apiFetch('/ops/banco/config', { method: 'POST', body: JSON.stringify({ desautorizar: true }) }).then(loadEstado)} style={btn()}>Desconectar Revolut</button></div>
        </>
      )}
    </div>
  );
}
