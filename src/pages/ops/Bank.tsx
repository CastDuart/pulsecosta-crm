import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/opsFetch';
import { formatEur, formatDate } from '../../lib/iva';
import type { Factura } from '../../types';
import { RefreshCw, Link2, ShieldCheck } from 'lucide-react';
import { useLang, type Lang } from '../../context/LangContext';

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
const LOCALE_BY_LANG: Record<Lang, string> = { es: 'es-ES', en: 'en-GB', fi: 'fi-FI', et: 'et-EE' };

export default function Bank() {
  const { lang, t } = useLang();
  const [params] = useSearchParams(); const navigate = useNavigate();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [pendientes, setPendientes] = useState<Factura[]>([]);
  const [form, setForm] = useState({ env: 'sandbox', client_id: '', merchant_secret: '' });
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);

  const loadEstado = useCallback(() => apiFetch<Estado>('/ops/banco/estado').then(e => { setEstado(e); setForm(f => ({ ...f, env: e.env, client_id: e.client_id || '' })); }), []);
  const loadDatos = useCallback(async () => {
    setBusy(true); setMsg('');
    try {
      const [c, t, f] = await Promise.all([apiFetch<Cuenta[]>('/ops/banco/cuentas'), apiFetch<Tx[]>('/ops/banco/transacciones'), apiFetch<Factura[]>('/ops/facturas')]);
      setCuentas(c); setTxs(t); setPendientes(f.filter(x => ['enviada', 'vencida'].includes(x.estado)));
    } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  }, []);
  useEffect(() => { loadEstado(); }, [loadEstado]);
  useEffect(() => { if (estado?.autorizado) loadDatos(); }, [estado?.autorizado, loadDatos]);
  // Vuelta del consentimiento de Revolut: /ops/bank/callback?code=...
  useEffect(() => {
    const code = params.get('code'); if (!code) return;
    setBusy(true);
    apiFetch<Estado>('/ops/banco/autorizar', { method: 'POST', body: JSON.stringify({ code }) })
      .then(e => { setEstado(e); setMsg(t('bank.authorizedOk')); navigate('/ops/bank', { replace: true }); })
      .catch(e => setMsg(String(e))).finally(() => setBusy(false));
  }, [navigate, params, t]);

  const guardar = async () => {
    setBusy(true); setMsg('');
    try { setEstado(await apiFetch<Estado>('/ops/banco/config', { method: 'POST', body: JSON.stringify(form) })); setMsg(t('bank.savedOk')); setForm(f => ({ ...f, merchant_secret: '' })); }
    catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };
  const autorizar = async () => { try { const { url } = await apiFetch<{ url: string }>('/ops/banco/autorizar-url'); window.location.href = url; } catch (e) { setMsg(String(e)); } };
  const registrarWebhook = async () => { setBusy(true); try { await apiFetch('/ops/banco/webhook/registrar', { method: 'POST' }); await loadEstado(); setMsg(t('bank.webhookOk')); } catch (e) { setMsg(String(e)); } finally { setBusy(false); } };
  const conciliar = async (tx: Tx, facturaId: number) => { setBusy(true); try { await apiFetch('/ops/banco/conciliar', { method: 'POST', body: JSON.stringify({ tx_id: tx.id, factura_id: facturaId }) }); await loadDatos(); } catch (e) { setMsg(String(e)); } finally { setBusy(false); } };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{t('bank.title')}</h1>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('bank.subtitle')}</div>
        </div>
        {estado?.autorizado && <button onClick={loadDatos} disabled={busy} style={btn()}><RefreshCw size={13} style={{ verticalAlign: -2 }} /> {t('bank.sync')}</button>}
      </div>
      {msg && <div style={{ marginBottom: 12, fontSize: 13, color: msg === t('bank.authorizedOk') || msg === t('bank.savedOk') || msg === t('bank.webhookOk') ? 'var(--verde-text)' : 'var(--rojo-text)' }}>{msg}</div>}

      {estado && !estado.autorizado && (
        <div style={{ ...card, padding: 20, marginBottom: 16, maxWidth: 760 }}>
          <div style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}><ShieldCheck size={15} style={{ verticalAlign: -2 }} /> {t('bank.connectTitle')}</div>
          <ol style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, paddingLeft: 18, marginTop: 0 }}>
            <li>{t('bank.stepCertificate')} <b>Settings → APIs → Business API → Add certificate</b>. {t('bank.stepRedirect')} <code>{estado.redirect_uri}</code>.</li>
            <li>{t('bank.stepClientId')}</li>
            <li>{t('bank.stepAuthorize')}</li>
            <li>{t('bank.stepMerchant')}</li>
          </ol>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10, alignItems: 'center', marginTop: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>{t('bank.environment')}</label>
            <select value={form.env} onChange={e => setForm({ ...form, env: e.target.value })} style={{ ...input, width: 220 }}><option value="sandbox">{t('bank.sandbox')}</option><option value="production">{t('bank.production')}</option></select>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Client ID</label>
            <input value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} placeholder={t('bank.clientIdPh')} style={input} autoComplete="off" name="revolut_client_id" />
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>{t('bank.merchantOptional')}</label>
            <input type="password" value={form.merchant_secret} onChange={e => setForm({ ...form, merchant_secret: e.target.value })} placeholder={estado.merchant ? t('bank.secretSavedPh') : 'sk_...'} style={input} autoComplete="new-password" name="revolut_merchant_secret" />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={guardar} disabled={busy} style={btn()}>{t('btn.save')}</button>
            <button onClick={autorizar} disabled={busy || !estado.client_id || !estado.clave_privada} style={btn(true)}>{t('bank.authorize')}</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
            {t('bank.privateKey')}: {estado.clave_privada ? t('common.yes') : t('bank.notFound')} · {t('bank.jwtIssuer')}: {estado.issuer}
          </div>
        </div>
      )}

      {estado?.autorizado && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            {cuentas.map(c => (
              <div key={c.id} style={{ ...card, padding: '14px 18px', minWidth: 200 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.name || t('bank.account')} · {c.currency}</div>
                <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{c.currency === 'EUR' ? formatEur(Number(c.balance)) : `${Number(c.balance).toFixed(2)} ${c.currency}`}</div>
              </div>
            ))}
            <div style={{ ...card, padding: '14px 18px', minWidth: 220 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('label.status')}</div>
              <div style={{ fontSize: 13, color: 'var(--ink)' }}>{estado.env === 'production' ? t('bank.productionShort') : 'Sandbox'} · webhook {estado.webhook ? t('bank.active') : t('common.no')} · Merchant {estado.merchant ? t('common.yes') : t('common.no')}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{t('bank.lastSync')}: {estado.ultima_sync ? new Date(estado.ultima_sync).toLocaleString(LOCALE_BY_LANG[lang]) : '—'}</div>
              {!estado.webhook && <button onClick={registrarWebhook} disabled={busy} style={{ ...btn(), marginTop: 8 }}>{t('bank.activateRealtime')}</button>}
            </div>
          </div>
          <div style={card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{[t('ops.date'), t('bank.reference'), t('bank.counterparty'), t('invoice.amount'), t('label.status'), t('ops.invoiceNumber')].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {txs.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--muted)', padding: 22 }}>{t('bank.noTransactions')}</td></tr>}
                {txs.map(tx => (
                  <tr key={tx.id}>
                    <td style={{ ...td, ...mono, color: 'var(--muted)' }}>{formatDate(tx.fecha)}</td>
                    <td style={{ ...td, color: 'var(--ink)' }}>{tx.referencia || '—'}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{tx.contraparte || '—'}</td>
                    <td style={{ ...td, ...mono, fontWeight: 700, color: Number(tx.importe) >= 0 ? 'var(--verde-text)' : 'var(--rojo-text)' }}>{formatEur(Number(tx.importe))}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{tx.estado}</td>
                    <td style={td}>
                      {tx.factura_numero ? <span style={{ color: 'var(--verde-text)', fontWeight: 700 }}><Link2 size={12} style={{ verticalAlign: -2 }} /> {tx.factura_numero}</span>
                        : Number(tx.importe) > 0 && pendientes.length > 0 ? (
                          <select defaultValue="" onChange={e => { if (e.target.value) conciliar(tx, Number(e.target.value)); }} style={{ ...input, width: 'auto', padding: '4px 8px', fontSize: 12 }}>
                            <option value="">{t('bank.reconcileWith')}</option>
                            {pendientes.map(f => <option key={f.id} value={f.id}>{f.numero} · {f.cliente_nombre} · {formatEur(f.total)}</option>)}
                          </select>
                        ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12 }}><button onClick={() => apiFetch('/ops/banco/config', { method: 'POST', body: JSON.stringify({ desautorizar: true }) }).then(loadEstado)} style={btn()}>{t('bank.disconnect')}</button></div>
        </>
      )}
    </div>
  );
}
