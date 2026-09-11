import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/opsFetch';
import { formatEur, formatDate } from '../../lib/iva';
import { Download, Lock, Unlock } from 'lucide-react';

// Libros contables: Mensual (libro menor, se reinicia cada mes y se cierra) y Mayor (anual).
type Mov = { id: number; fecha: string; tipo: 'ingreso' | 'gasto'; concepto: string; categoria?: string; cliente_nombre?: string; factura_numero?: string; importe: number; iva_importe: number; saldo: number };
type Fac = { id: number; numero: string; fecha_emision: string; estado: string; cliente_nombre?: string; subtotal: number; iva_importe: number; total: number };
type Mensual = { year: number; month: number; ingresos: number; gastos: number; resultado: number; iva_soportado: number; iva_repercutido: number; iva_a_ingresar: number; facturado: number; pendiente_cobro: number; saldo_inicial: number; saldo_final: number; n_movimientos: number; n_facturas: number; movimientos: Mov[]; facturas: Fac[]; cierre: { cerrado_at: string; notas?: string } | null };
type MesMayor = { month: number; ingresos: number; gastos: number; resultado: number; acumulado: number; iva_repercutido: number; iva_soportado: number; facturado: number; saldo_final: number; cerrado: boolean };
type Mayor = { year: number; meses: MesMayor[]; cuentas: { tipo: string; categoria: string; total: number; iva: number; n: number }[]; clientes: { cliente: string; facturas: number; facturado: number; cobrado: number; pendiente: number }[]; trimestres: { trimestre: number; iva_repercutido: number; iva_soportado: number; a_ingresar: number; facturado: number }[]; totales: { ingresos: number; gastos: number; resultado: number; facturado: number; iva_repercutido: number; iva_soportado: number; saldo_final: number } };

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const n = (x: unknown) => Number(x) || 0;
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', color: 'var(--muted)', fontWeight: 500, fontSize: 12, borderBottom: '1px solid var(--linea)' };
const td: React.CSSProperties = { padding: '9px 14px', fontSize: 13, borderBottom: '1px solid var(--linea)' };
const mono: React.CSSProperties = { fontFamily: 'JetBrains Mono, monospace' };
const card: React.CSSProperties = { background: 'var(--ivory-alt)', borderRadius: 12, border: '1px solid var(--linea)', overflow: 'hidden' };

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

export default function Books() {
  const now = new Date();
  const [tab, setTab] = useState<'mensual' | 'mayor'>('mensual');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [mensual, setMensual] = useState<Mensual | null>(null);
  const [mayor, setMayor] = useState<Mayor | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const loadMensual = () => apiFetch<Mensual>(`/ops/libros/mensual?year=${year}&month=${month}`).then(setMensual).catch(e => setErr(String(e)));
  const loadMayor = () => apiFetch<Mayor>(`/ops/libros/mayor?year=${year}`).then(setMayor).catch(e => setErr(String(e)));
  useEffect(() => { setErr(''); if (tab === 'mensual') loadMensual(); else loadMayor(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab, year, month]);

  const cerrarMes = async () => {
    if (!mensual || !confirm(`¿Cerrar ${MESES[month - 1]} ${year}? No se podrán añadir movimientos ni facturas con fecha de ese mes.`)) return;
    setBusy(true); setErr('');
    try { await apiFetch('/ops/libros/cierre', { method: 'POST', body: JSON.stringify({ year, month }) }); await loadMensual(); }
    catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  const reabrirMes = async () => {
    if (!confirm(`¿Reabrir ${MESES[month - 1]} ${year}?`)) return;
    setBusy(true); setErr('');
    try { await apiFetch(`/ops/libros/cierre/${year}/${month}`, { method: 'DELETE' }); await loadMensual(); }
    catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  const mesTerminado = new Date(Date.UTC(year, month, 0)) < new Date(now.toISOString().slice(0, 10));

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>Libros</h1>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Libro mensual (se reinicia cada mes, con cierre) y libro mayor anual</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['mensual', 'mayor'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, background: tab === t ? 'var(--pulse)' : 'var(--ivory-alt)', color: tab === t ? 'var(--petrol)' : 'var(--muted)' }}>
              {t === 'mensual' ? 'Libro mensual' : 'Libro mayor'}
            </button>
          ))}
          {tab === 'mensual' && (
            <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--linea)', background: 'var(--ivory-alt)', color: 'var(--ink)' }}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          )}
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--linea)', background: 'var(--ivory-alt)', color: 'var(--ink)' }}>
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      {err && <div style={{ color: 'var(--rojo-text)', marginBottom: 12, fontSize: 13 }}>{err}</div>}

      {tab === 'mensual' && mensual && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <Kpi label="Saldo inicial" value={n(mensual.saldo_inicial)} />
            <Kpi label="Ingresos (caja)" value={n(mensual.ingresos)} color="var(--verde-text)" />
            <Kpi label="Gastos (caja)" value={n(mensual.gastos)} color="var(--rojo-text)" />
            <Kpi label="Resultado del mes" value={n(mensual.resultado)} color={n(mensual.resultado) >= 0 ? 'var(--verde-text)' : 'var(--rojo-text)'} />
            <Kpi label="Saldo final" value={n(mensual.saldo_final)} />
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <Kpi label="Facturado (emitido)" value={n(mensual.facturado)} />
            <Kpi label="Pendiente de cobro" value={n(mensual.pendiente_cobro)} color="var(--naranja-text)" />
            <Kpi label="IVA repercutido" value={n(mensual.iva_repercutido)} />
            <Kpi label="IVA soportado" value={n(mensual.iva_soportado)} />
            <Kpi label="IVA a ingresar" value={n(mensual.iva_a_ingresar)} color={n(mensual.iva_a_ingresar) > 0 ? 'var(--rojo-text)' : 'var(--verde-text)'} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {mensual.cierre
                ? <span style={{ color: 'var(--verde-text)', fontWeight: 700 }}><Lock size={13} style={{ verticalAlign: -2 }} /> Mes cerrado el {formatDate(mensual.cierre.cerrado_at)}</span>
                : <span>Mes abierto · {mensual.n_movimientos} movimientos · {mensual.n_facturas} facturas</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => csvDownload(`libro-mensual-${year}-${String(month).padStart(2, '0')}.csv`, [['Fecha', 'Tipo', 'Concepto', 'Categoría', 'Cliente', 'Factura', 'Importe', 'IVA', 'Saldo'], ...mensual.movimientos.map(m => [m.fecha.slice(0, 10), m.tipo, m.concepto, m.categoria ?? '', m.cliente_nombre ?? '', m.factura_numero ?? '', (m.tipo === 'ingreso' ? 1 : -1) * n(m.importe), n(m.iva_importe), n(m.saldo)])])}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--linea)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>
                <Download size={14} /> CSV
              </button>
              {mensual.cierre
                ? <button onClick={reabrirMes} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--linea)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}><Unlock size={14} /> Reabrir mes</button>
                : <button onClick={cerrarMes} disabled={busy || !mesTerminado} title={mesTerminado ? '' : 'Solo se cierra un mes terminado'} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: mesTerminado ? 'rgba(23,129,127,0.15)' : 'rgba(15,46,56,0.08)', color: mesTerminado ? 'var(--verde-text)' : 'var(--muted)', cursor: mesTerminado ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 700 }}><Lock size={14} /> Cerrar mes</button>}
            </div>
          </div>

          <div style={{ ...card, marginBottom: 18 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Fecha', 'Concepto', 'Categoría', 'Cliente / Factura', 'Importe', 'IVA', 'Saldo'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {mensual.movimientos.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--muted)', padding: 22 }}>Sin movimientos de caja este mes</td></tr>}
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

          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Facturas emitidas en el mes</div>
          <div style={card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Número', 'Fecha', 'Cliente', 'Estado', 'Base', 'IVA', 'Total'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {mensual.facturas.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--muted)', padding: 22 }}>Sin facturas emitidas este mes</td></tr>}
                {mensual.facturas.map(f => (
                  <tr key={f.id}>
                    <td style={{ ...td, ...mono }}>{f.numero}</td>
                    <td style={{ ...td, ...mono, color: 'var(--muted)' }}>{formatDate(f.fecha_emision)}</td>
                    <td style={{ ...td, color: 'var(--ink)' }}>{f.cliente_nombre ?? '—'}</td>
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
            <Kpi label={`Ingresos ${year}`} value={n(mayor.totales.ingresos)} color="var(--verde-text)" />
            <Kpi label={`Gastos ${year}`} value={n(mayor.totales.gastos)} color="var(--rojo-text)" />
            <Kpi label="Resultado" value={n(mayor.totales.resultado)} color={n(mayor.totales.resultado) >= 0 ? 'var(--verde-text)' : 'var(--rojo-text)'} />
            <Kpi label="Facturado" value={n(mayor.totales.facturado)} />
            <Kpi label="IVA neto anual" value={n(mayor.totales.iva_repercutido) - n(mayor.totales.iva_soportado)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <button onClick={() => csvDownload(`libro-mayor-${year}.csv`, [['Mes', 'Ingresos', 'Gastos', 'Resultado', 'Acumulado', 'Facturado', 'IVA repercutido', 'IVA soportado', 'Saldo final', 'Cerrado'], ...mayor.meses.map(m => [MESES[m.month - 1], n(m.ingresos), n(m.gastos), n(m.resultado), n(m.acumulado), n(m.facturado), n(m.iva_repercutido), n(m.iva_soportado), n(m.saldo_final), m.cerrado ? 'sí' : 'no'])])}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--linea)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>
              <Download size={14} /> CSV
            </button>
          </div>
          <div style={{ ...card, marginBottom: 18 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Mes', 'Ingresos', 'Gastos', 'Resultado', 'Acumulado', 'Facturado', 'IVA rep.', 'IVA sop.', 'Saldo final', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {mayor.meses.map(m => (
                  <tr key={m.month} style={{ cursor: 'pointer' }} onClick={() => { setMonth(m.month); setTab('mensual'); }} title="Ver libro mensual">
                    <td style={{ ...td, color: 'var(--ink)', fontWeight: 600 }}>{MESES[m.month - 1]}</td>
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
              <div style={{ padding: '12px 14px', fontWeight: 700, fontSize: 13, color: 'var(--ink)', borderBottom: '1px solid var(--linea)' }}>IVA por trimestre</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['T', 'Facturado', 'Repercutido', 'Soportado', 'A ingresar'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{mayor.trimestres.map(q => (
                  <tr key={q.trimestre}><td style={td}>T{q.trimestre}</td><td style={{ ...td, ...mono }}>{formatEur(n(q.facturado))}</td><td style={{ ...td, ...mono }}>{formatEur(n(q.iva_repercutido))}</td><td style={{ ...td, ...mono }}>{formatEur(n(q.iva_soportado))}</td><td style={{ ...td, ...mono, fontWeight: 700 }}>{formatEur(n(q.a_ingresar))}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <div style={card}>
              <div style={{ padding: '12px 14px', fontWeight: 700, fontSize: 13, color: 'var(--ink)', borderBottom: '1px solid var(--linea)' }}>Cuentas (caja por tipo y categoría)</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Tipo', 'Categoría', 'Movs.', 'Total', 'IVA'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {mayor.cuentas.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--muted)' }}>Sin movimientos</td></tr>}
                  {mayor.cuentas.map((c, i) => (
                    <tr key={i}><td style={{ ...td, color: c.tipo === 'ingreso' ? 'var(--verde-text)' : 'var(--rojo-text)' }}>{c.tipo}</td><td style={td}>{c.categoria}</td><td style={{ ...td, ...mono, color: 'var(--muted)' }}>{c.n}</td><td style={{ ...td, ...mono, fontWeight: 700 }}>{formatEur(n(c.total))}</td><td style={{ ...td, ...mono, color: 'var(--muted)' }}>{formatEur(n(c.iva))}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={card}>
              <div style={{ padding: '12px 14px', fontWeight: 700, fontSize: 13, color: 'var(--ink)', borderBottom: '1px solid var(--linea)' }}>Clientes (facturación anual)</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Cliente', 'Facturas', 'Facturado', 'Cobrado', 'Pendiente'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {mayor.clientes.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--muted)' }}>Sin facturas</td></tr>}
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
