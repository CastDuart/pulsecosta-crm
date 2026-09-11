import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/opsFetch';
import { formatEur, formatDate } from '../../lib/iva';
import { AlertTriangle, Download, FileText, Lock, Unlock } from 'lucide-react';
import { useLang, type Lang } from '../../context/LangContext';

// Libros contables: Mensual (libro menor, se reinicia cada mes y se cierra) y Mayor (anual).
type Mov = { id: number; fecha: string; tipo: 'ingreso' | 'gasto'; concepto: string; categoria?: string; cliente_nombre?: string; factura_numero?: string; importe: number; iva_importe: number; saldo: number };
type Fac = { id: number; numero: string; fecha_emision: string; estado: string; cliente_nombre?: string; subtotal: number; iva_importe: number; total: number; iva_rate?: number; tipo_iva?: string; iva_jurisdiccion?: string; pais?: string; vat_number?: string; tipo_cliente?: string };
type Mensual = { year: number; month: number; ingresos: number; gastos: number; resultado: number; iva_soportado: number; iva_repercutido: number; iva_a_ingresar: number; facturado: number; pendiente_cobro: number; saldo_inicial: number; saldo_final: number; n_movimientos: number; n_facturas: number; movimientos: Mov[]; facturas: Fac[]; cierre: { cerrado_at: string; notas?: string } | null };
type MesMayor = { month: number; ingresos: number; gastos: number; resultado: number; acumulado: number; iva_repercutido: number; iva_soportado: number; facturado: number; saldo_final: number; cerrado: boolean };
type Mayor = { year: number; meses: MesMayor[]; cuentas: { tipo: string; categoria: string; total: number; iva: number; n: number }[]; clientes: { cliente: string; facturas: number; facturado: number; cobrado: number; pendiente: number }[]; trimestres: { trimestre: number; iva_repercutido: number; iva_soportado: number; a_ingresar: number; facturado: number }[]; totales: { ingresos: number; gastos: number; resultado: number; facturado: number; iva_repercutido: number; iva_soportado: number; saldo_final: number } };

const LOCALE_BY_LANG: Record<Lang, string> = { es: 'es-ES', en: 'en-GB', fi: 'fi-FI', et: 'et-EE' };
const n = (x: unknown) => Number(x) || 0;
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', color: 'var(--muted)', fontWeight: 500, fontSize: 12, borderBottom: '1px solid var(--linea)' };
const td: React.CSSProperties = { padding: '9px 14px', fontSize: 13, borderBottom: '1px solid var(--linea)' };
const mono: React.CSSProperties = { fontFamily: 'JetBrains Mono, monospace' };
const card: React.CSSProperties = { background: 'var(--ivory-alt)', borderRadius: 12, border: '1px solid var(--linea)', overflow: 'hidden' };
const subtleCard: React.CSSProperties = { background: 'var(--ivory)', borderRadius: 8, border: '1px solid var(--linea)', padding: '12px 14px' };

function Kpi({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ ...card, padding: '14px 18px', flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ ...mono, fontSize: 20, fontWeight: 700, color: color ?? 'var(--ink)' }}>{formatEur(value)}</div>
    </div>
  );
}
function csvDownload(name: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const blob = new Blob(['﻿' + rows.map(r => r.map(esc).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function fiscalBucket(f: Fac): 'estonia' | 'euB2b' | 'b2cOss' | 'spainVat' | 'outsideEu' | 'needsReview' {
  const country = (f.pais || '').trim().toUpperCase();
  const isB2c = f.tipo_cliente === 'b2c';
  const eu = ['AT','BE','BG','HR','CY','CZ','DK','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','SE'];
  if ((f.iva_jurisdiccion || '').toLowerCase() === 'spain') return 'spainVat';
  if (country === 'EE' || country === 'ESTONIA') return 'estonia';
  if (isB2c && (eu.includes(country) || ['ESPAÑA','SPAIN','FINLANDIA','FINLAND','SUOMI'].includes(country))) return 'b2cOss';
  if ((f.iva_jurisdiccion || '').toLowerCase() === 'eu' || f.tipo_iva === 'intracomunitario') return 'euB2b';
  if (country && !eu.includes(country) && !['ESPAÑA','SPAIN','FINLANDIA','FINLAND','SUOMI'].includes(country)) return 'outsideEu';
  return 'needsReview';
}

function sumFacturas(facturas: Fac[]) {
  return facturas.reduce((s, f) => s + n(f.total), 0);
}

function FiscalMini({ label, count, amount, countLabel, warn = false }: { label: string; count: number; amount: number; countLabel: string; warn?: boolean }) {
  return (
    <div style={{ ...subtleCard, borderColor: warn && count > 0 ? 'rgba(255,122,26,0.35)' : 'var(--linea)' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ ...mono, color: warn && count > 0 ? 'var(--naranja-text)' : 'var(--ink)', fontSize: 16, fontWeight: 800 }}>{formatEur(amount)}</div>
      <div style={{ fontSize: 11, color: 'var(--muted-tint)', marginTop: 2 }}>{countLabel}</div>
    </div>
  );
}

export default function Books() {
  const { lang, t } = useLang();
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString(LOCALE_BY_LANG[lang], { month: 'long' }));
  const [tab, setTab] = useState<'mensual' | 'mayor'>('mensual');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [mensual, setMensual] = useState<Mensual | null>(null);
  const [mayor, setMayor] = useState<Mayor | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const loadMensual = useCallback(() => apiFetch<Mensual>(`/ops/libros/mensual?year=${year}&month=${month}`).then(setMensual).catch(e => setErr(String(e))), [month, year]);
  const loadMayor = useCallback(() => apiFetch<Mayor>(`/ops/libros/mayor?year=${year}`).then(setMayor).catch(e => setErr(String(e))), [year]);
  useEffect(() => { setErr(''); if (tab === 'mensual') loadMensual(); else loadMayor(); }, [tab, loadMayor, loadMensual]);

  const cerrarMes = async () => {
    if (!mensual || !confirm(t('books.confirmClose', { month: months[month - 1], year }))) return;
    setBusy(true); setErr('');
    try { await apiFetch('/ops/libros/cierre', { method: 'POST', body: JSON.stringify({ year, month }) }); await loadMensual(); }
    catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  const reabrirMes = async () => {
    if (!confirm(t('books.confirmReopen', { month: months[month - 1], year }))) return;
    setBusy(true); setErr('');
    try { await apiFetch(`/ops/libros/cierre/${year}/${month}`, { method: 'DELETE' }); await loadMensual(); }
    catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  const mesTerminado = new Date(Date.UTC(year, month, 0)) < new Date(now.toISOString().slice(0, 10));
  const fiscalSummary = mensual ? {
    estonia: mensual.facturas.filter(f => fiscalBucket(f) === 'estonia'),
    euB2b: mensual.facturas.filter(f => fiscalBucket(f) === 'euB2b'),
    b2cOss: mensual.facturas.filter(f => fiscalBucket(f) === 'b2cOss'),
    spainVat: mensual.facturas.filter(f => fiscalBucket(f) === 'spainVat'),
    outsideEu: mensual.facturas.filter(f => fiscalBucket(f) === 'outsideEu'),
    needsReview: mensual.facturas.filter(f => fiscalBucket(f) === 'needsReview' || (f.tipo_cliente === 'b2b' && fiscalBucket(f) === 'euB2b' && !f.vat_number)),
  } : null;
  const exportGestor = () => {
    if (!mensual || !fiscalSummary) return;
    const rows: (string | number)[][] = [
      [t('books.csv.block'), t('books.csv.model'), t('invoice.amount'), t('books.csv.detail')],
      [t('books.csv.summary'), t('books.cashIncome'), n(mensual.ingresos), t('books.csv.cashIncomeDetail')],
      [t('books.csv.summary'), t('books.cashExpenses'), n(mensual.gastos), t('books.csv.cashExpensesDetail')],
      [t('books.csv.summary'), t('books.billedIssued'), n(mensual.facturado), t('books.csv.billedDetail')],
      [t('books.csv.summary'), t('books.outstanding'), n(mensual.pendiente_cobro), t('books.csv.outstandingDetail')],
      ['Estonia', 'KMD/KMD INF', sumFacturas(fiscalSummary.estonia), t('books.csv.estoniaDetail', { count: fiscalSummary.estonia.length })],
      ['Estonia', 'VD / B2B EU reverse charge', sumFacturas(fiscalSummary.euB2b), t('books.csv.euB2bDetail', { count: fiscalSummary.euB2b.length })],
      ['Estonia', 'OSS / B2C EU', sumFacturas(fiscalSummary.b2cOss), t('books.csv.b2cOssDetail', { count: fiscalSummary.b2cOss.length })],
      [t('invoice.jurisdiction.spain'), 'Spanish VAT / Verifactu exception', sumFacturas(fiscalSummary.spainVat), t('books.csv.spainDetail', { count: fiscalSummary.spainVat.length })],
      [t('books.outsideEu'), t('books.exportedServices'), sumFacturas(fiscalSummary.outsideEu), t('books.csv.outsideEuDetail', { count: fiscalSummary.outsideEu.length })],
      [t('books.review'), t('books.vatJurisdictionPending'), sumFacturas(fiscalSummary.needsReview), t('books.csv.reviewDetail', { count: fiscalSummary.needsReview.length })],
      [],
      [t('ops.invoiceNumber'), t('ops.clientName'), t('label.country'), t('books.clientType'), t('books.clientVat'), t('invoice.vatJurisdiction'), t('invoice.vatType'), t('invoice.taxableBase'), 'VAT', t('ops.total'), t('label.status')],
      ...mensual.facturas.map(f => [f.numero, f.cliente_nombre ?? '', f.pais ?? '', f.tipo_cliente ?? '', f.vat_number ?? '', f.iva_jurisdiccion ?? '', f.tipo_iva ?? '', n(f.subtotal), n(f.iva_importe), n(f.total), f.estado]),
      [],
      [t('books.movement'), t('ops.date'), t('label.type'), t('ops.cash.concept'), t('ops.cash.category'), t('ops.clientName'), t('ops.invoiceNumber'), t('invoice.amount'), 'VAT'],
      ...mensual.movimientos.map(m => [m.id, m.fecha.slice(0, 10), m.tipo, m.concepto, m.categoria ?? '', m.cliente_nombre ?? '', m.factura_numero ?? '', n(m.importe), n(m.iva_importe)]),
    ];
    csvDownload(`paquete-gestor-tallinn-${year}-${String(month).padStart(2, '0')}.csv`, rows);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{t('books.title')}</h1>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('books.subtitle')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['mensual', 'mayor'] as const).map(tabId => (
            <button key={tabId} onClick={() => setTab(tabId)} style={{ padding: '8px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, background: tab === tabId ? 'var(--pulse)' : 'var(--ivory-alt)', color: tab === tabId ? 'var(--petrol)' : 'var(--muted)' }}>
              {tabId === 'mensual' ? t('books.monthlyBook') : t('books.generalLedger')}
            </button>
          ))}
          {tab === 'mensual' && (
            <select aria-label={t('books.month')} value={month} onChange={e => setMonth(Number(e.target.value))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--linea)', background: 'var(--ivory-alt)', color: 'var(--ink)' }}>
              {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          )}
          <select aria-label={t('books.year')} value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--linea)', background: 'var(--ivory-alt)', color: 'var(--ink)' }}>
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      {err && <div style={{ color: 'var(--rojo-text)', marginBottom: 12, fontSize: 13 }}>{err}</div>}

      {tab === 'mensual' && mensual && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <Kpi label={t('books.openingBalance')} value={n(mensual.saldo_inicial)} />
            <Kpi label={t('books.cashIncome')} value={n(mensual.ingresos)} color="var(--verde-text)" />
            <Kpi label={t('books.cashExpenses')} value={n(mensual.gastos)} color="var(--rojo-text)" />
            <Kpi label={t('books.monthResult')} value={n(mensual.resultado)} color={n(mensual.resultado) >= 0 ? 'var(--verde-text)' : 'var(--rojo-text)'} />
            <Kpi label={t('books.closingBalance')} value={n(mensual.saldo_final)} />
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <Kpi label={t('books.billedIssued')} value={n(mensual.facturado)} />
            <Kpi label={t('books.outstanding')} value={n(mensual.pendiente_cobro)} color="var(--naranja-text)" />
            <Kpi label={t('books.outputVat')} value={n(mensual.iva_repercutido)} />
            <Kpi label={t('books.inputVat')} value={n(mensual.iva_soportado)} />
            <Kpi label={t('books.vatDue')} value={n(mensual.iva_a_ingresar)} color={n(mensual.iva_a_ingresar) > 0 ? 'var(--rojo-text)' : 'var(--verde-text)'} />
          </div>

          {fiscalSummary && (
            <div style={{ ...card, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink)', fontWeight: 800, fontSize: 14 }}>
                    <FileText size={16} /> {t('books.accountantSummary')}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
                    {t('books.accountantHelp')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link to="/ops/tax-reference" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--linea)', color: 'var(--teal-tint)', textDecoration: 'none', fontSize: 12, fontWeight: 700 }}>
                    {t('books.viewTax')}
                  </Link>
                  <button onClick={exportGestor} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: 'none', background: 'var(--pulse)', color: 'var(--petrol)', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
                    <Download size={14} /> {t('books.exportAccountant')}
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <FiscalMini label="KMD Estonia" count={fiscalSummary.estonia.length} countLabel={t('books.invoiceCount', { count: fiscalSummary.estonia.length })} amount={sumFacturas(fiscalSummary.estonia)} />
                <FiscalMini label={t('books.vdEuB2b')} count={fiscalSummary.euB2b.length} countLabel={t('books.invoiceCount', { count: fiscalSummary.euB2b.length })} amount={sumFacturas(fiscalSummary.euB2b)} />
                <FiscalMini label={t('books.ossEuB2c')} count={fiscalSummary.b2cOss.length} countLabel={t('books.invoiceCount', { count: fiscalSummary.b2cOss.length })} amount={sumFacturas(fiscalSummary.b2cOss)} />
                <FiscalMini label={t('books.spainVerifactu')} count={fiscalSummary.spainVat.length} countLabel={t('books.invoiceCount', { count: fiscalSummary.spainVat.length })} amount={sumFacturas(fiscalSummary.spainVat)} warn />
                <FiscalMini label={t('books.outsideEu')} count={fiscalSummary.outsideEu.length} countLabel={t('books.invoiceCount', { count: fiscalSummary.outsideEu.length })} amount={sumFacturas(fiscalSummary.outsideEu)} />
                <FiscalMini label={t('books.reviewVat')} count={fiscalSummary.needsReview.length} countLabel={t('books.invoiceCount', { count: fiscalSummary.needsReview.length })} amount={sumFacturas(fiscalSummary.needsReview)} warn />
              </div>

              {fiscalSummary.needsReview.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-start', color: 'var(--naranja-text)', fontSize: 12, background: 'rgba(255,122,26,0.08)', border: '1px solid rgba(255,122,26,0.20)', borderRadius: 8, padding: '9px 11px' }}>
                  <AlertTriangle size={15} />
                  <span>{t('books.reviewWarning')}</span>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {mensual.cierre
                ? <span style={{ color: 'var(--verde-text)', fontWeight: 700 }}><Lock size={13} style={{ verticalAlign: -2 }} /> {t('books.closedOn', { date: formatDate(mensual.cierre.cerrado_at) })}</span>
                : <span>{t('books.openMonth', { movements: mensual.n_movimientos, invoices: mensual.n_facturas })}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => csvDownload(`libro-mensual-${year}-${String(month).padStart(2, '0')}.csv`, [[t('ops.date'), t('label.type'), t('ops.cash.concept'), t('ops.cash.category'), t('ops.clientName'), t('ops.invoiceNumber'), t('invoice.amount'), 'VAT', t('books.balance')], ...mensual.movimientos.map(m => [m.fecha.slice(0, 10), m.tipo, m.concepto, m.categoria ?? '', m.cliente_nombre ?? '', m.factura_numero ?? '', (m.tipo === 'ingreso' ? 1 : -1) * n(m.importe), n(m.iva_importe), n(m.saldo)])])}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--linea)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>
                <Download size={14} /> CSV
              </button>
              {mensual.cierre
                ? <button onClick={reabrirMes} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--linea)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}><Unlock size={14} /> {t('books.reopenMonth')}</button>
                : <button onClick={cerrarMes} disabled={busy || !mesTerminado} title={mesTerminado ? '' : t('books.closeDisabled')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: mesTerminado ? 'rgba(23,129,127,0.15)' : 'rgba(15,46,56,0.08)', color: mesTerminado ? 'var(--verde-text)' : 'var(--muted)', cursor: mesTerminado ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 700 }}><Lock size={14} /> {t('books.closeMonth')}</button>}
            </div>
          </div>

          <div style={{ ...card, marginBottom: 18 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{[t('ops.date'), t('ops.cash.concept'), t('ops.cash.category'), t('books.clientInvoice'), t('invoice.amount'), 'VAT', t('books.balance')].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {mensual.movimientos.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--muted)', padding: 22 }}>{t('books.noCashMovements')}</td></tr>}
                {mensual.movimientos.map(m => (
                  <tr key={m.id}>
                    <td style={{ ...td, ...mono, color: 'var(--muted)' }}>{formatDate(m.fecha)}</td>
                    <td style={{ ...td, color: 'var(--ink)' }}>{m.concepto}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{m.categoria ?? '—'}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{[m.cliente_nombre, m.factura_numero].filter(Boolean).join(' · ') || '—'}</td>
                    <td style={{ ...td, ...mono, fontWeight: 700, color: m.tipo === 'ingreso' ? 'var(--verde-text)' : 'var(--rojo-text)' }}>{m.tipo === 'ingreso' ? '+' : '−'}{formatEur(n(m.importe))}</td>
                    <td style={{ ...td, ...mono, color: 'var(--muted)' }}>{n(m.iva_importe) ? formatEur(n(m.iva_importe)) : '—'}</td>
                    <td style={{ ...td, ...mono }}>{formatEur(n(m.saldo))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>{t('books.monthInvoices')}</div>
          <div style={card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{[t('ops.invoiceNumber'), t('ops.date'), t('ops.clientName'), t('label.country'), 'B2B/B2C', 'VAT', t('books.jurisdiction'), t('label.status'), t('invoice.taxableBase'), 'VAT', t('ops.total')].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {mensual.facturas.length === 0 && <tr><td colSpan={11} style={{ ...td, textAlign: 'center', color: 'var(--muted)', padding: 22 }}>{t('books.noInvoices')}</td></tr>}
                {mensual.facturas.map(f => (
                  <tr key={f.id}>
                    <td style={{ ...td, ...mono }}>{f.numero}</td>
                    <td style={{ ...td, ...mono, color: 'var(--muted)' }}>{formatDate(f.fecha_emision)}</td>
                    <td style={{ ...td, color: 'var(--ink)' }}>{f.cliente_nombre ?? '—'}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{f.pais ?? '—'}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{f.tipo_cliente ?? '—'}</td>
                    <td style={{ ...td, ...mono, color: f.tipo_cliente === 'b2b' && !f.vat_number ? 'var(--naranja-text)' : 'var(--muted)' }}>{f.vat_number ?? '—'}</td>
                    <td style={{ ...td, color: fiscalBucket(f) === 'needsReview' ? 'var(--naranja-text)' : 'var(--muted)' }}>{f.iva_jurisdiccion ?? f.tipo_iva ?? '—'}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{f.estado}</td>
                    <td style={{ ...td, ...mono }}>{formatEur(n(f.subtotal))}</td>
                    <td style={{ ...td, ...mono, color: 'var(--muted)' }}>{formatEur(n(f.iva_importe))}</td>
                    <td style={{ ...td, ...mono, fontWeight: 700 }}>{formatEur(n(f.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'mayor' && mayor && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <Kpi label={t('books.yearIncome', { year })} value={n(mayor.totales.ingresos)} color="var(--verde-text)" />
            <Kpi label={t('books.yearExpenses', { year })} value={n(mayor.totales.gastos)} color="var(--rojo-text)" />
            <Kpi label={t('books.result')} value={n(mayor.totales.resultado)} color={n(mayor.totales.resultado) >= 0 ? 'var(--verde-text)' : 'var(--rojo-text)'} />
            <Kpi label={t('books.billed')} value={n(mayor.totales.facturado)} />
            <Kpi label={t('books.annualNetVat')} value={n(mayor.totales.iva_repercutido) - n(mayor.totales.iva_soportado)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <button onClick={() => csvDownload(`libro-mayor-${year}.csv`, [[t('books.month'), t('books.income'), t('books.expenses'), t('books.result'), t('books.accumulated'), t('books.billed'), t('books.outputVat'), t('books.inputVat'), t('books.closingBalance'), t('books.closed')], ...mayor.meses.map(m => [months[m.month - 1], n(m.ingresos), n(m.gastos), n(m.resultado), n(m.acumulado), n(m.facturado), n(m.iva_repercutido), n(m.iva_soportado), n(m.saldo_final), m.cerrado ? t('common.yes') : t('common.no')])])}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--linea)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>
              <Download size={14} /> CSV
            </button>
          </div>
          <div style={{ ...card, marginBottom: 18 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{[t('books.month'), t('books.income'), t('books.expenses'), t('books.result'), t('books.accumulated'), t('books.billed'), t('books.outputVatShort'), t('books.inputVatShort'), t('books.closingBalance'), ''].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {mayor.meses.map(m => (
                  <tr key={m.month} style={{ cursor: 'pointer' }} onClick={() => { setMonth(m.month); setTab('mensual'); }} title={t('books.viewMonthly')}>
                    <td style={{ ...td, color: 'var(--ink)', fontWeight: 600 }}>{months[m.month - 1]}</td>
                    <td style={{ ...td, ...mono, color: 'var(--verde-text)' }}>{formatEur(n(m.ingresos))}</td>
                    <td style={{ ...td, ...mono, color: 'var(--rojo-text)' }}>{formatEur(n(m.gastos))}</td>
                    <td style={{ ...td, ...mono, fontWeight: 700 }}>{formatEur(n(m.resultado))}</td>
                    <td style={{ ...td, ...mono, color: 'var(--muted)' }}>{formatEur(n(m.acumulado))}</td>
                    <td style={{ ...td, ...mono }}>{formatEur(n(m.facturado))}</td>
                    <td style={{ ...td, ...mono, color: 'var(--muted)' }}>{formatEur(n(m.iva_repercutido))}</td>
                    <td style={{ ...td, ...mono, color: 'var(--muted)' }}>{formatEur(n(m.iva_soportado))}</td>
                    <td style={{ ...td, ...mono }}>{formatEur(n(m.saldo_final))}</td>
                    <td style={{ ...td, color: 'var(--verde-text)' }}>{m.cerrado ? <Lock size={13} /> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <div style={card}>
              <div style={{ padding: '12px 14px', fontWeight: 700, fontSize: 13, color: 'var(--ink)', borderBottom: '1px solid var(--linea)' }}>{t('books.vatByQuarter')}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['T', t('books.billed'), t('books.outputVatShort'), t('books.inputVatShort'), t('books.toPay')].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{mayor.trimestres.map(q => (
                  <tr key={q.trimestre}><td style={td}>T{q.trimestre}</td><td style={{ ...td, ...mono }}>{formatEur(n(q.facturado))}</td><td style={{ ...td, ...mono }}>{formatEur(n(q.iva_repercutido))}</td><td style={{ ...td, ...mono }}>{formatEur(n(q.iva_soportado))}</td><td style={{ ...td, ...mono, fontWeight: 700 }}>{formatEur(n(q.a_ingresar))}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <div style={card}>
              <div style={{ padding: '12px 14px', fontWeight: 700, fontSize: 13, color: 'var(--ink)', borderBottom: '1px solid var(--linea)' }}>{t('books.accountsByCategory')}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{[t('label.type'), t('ops.cash.category'), t('books.movementsShort'), t('ops.total'), 'VAT'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {mayor.cuentas.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--muted)' }}>{t('books.noMovements')}</td></tr>}
                  {mayor.cuentas.map((c, i) => (
                    <tr key={i}><td style={{ ...td, color: c.tipo === 'ingreso' ? 'var(--verde-text)' : 'var(--rojo-text)' }}>{c.tipo}</td><td style={td}>{c.categoria}</td><td style={{ ...td, ...mono, color: 'var(--muted)' }}>{c.n}</td><td style={{ ...td, ...mono, fontWeight: 700 }}>{formatEur(n(c.total))}</td><td style={{ ...td, ...mono, color: 'var(--muted)' }}>{formatEur(n(c.iva))}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={card}>
              <div style={{ padding: '12px 14px', fontWeight: 700, fontSize: 13, color: 'var(--ink)', borderBottom: '1px solid var(--linea)' }}>{t('books.clientsAnnualBilling')}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{[t('ops.clientName'), t('books.invoices'), t('books.billed'), t('books.collected'), t('books.outstandingShort')].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {mayor.clientes.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--muted)' }}>{t('books.noInvoicesShort')}</td></tr>}
                  {mayor.clientes.map((c, i) => (
                    <tr key={i}><td style={{ ...td, color: 'var(--ink)' }}>{c.cliente}</td><td style={{ ...td, ...mono, color: 'var(--muted)' }}>{c.facturas}</td><td style={{ ...td, ...mono, fontWeight: 700 }}>{formatEur(n(c.facturado))}</td><td style={{ ...td, ...mono, color: 'var(--verde-text)' }}>{formatEur(n(c.cobrado))}</td><td style={{ ...td, ...mono, color: 'var(--naranja-text)' }}>{formatEur(n(c.pendiente))}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
