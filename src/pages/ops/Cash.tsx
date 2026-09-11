import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/opsFetch';
import type { CajaMovimiento, Cliente, Factura, TipoIva } from '../../types';
import { formatEur, formatDate, calcIva, calcTotal, getDefaultIvaRate, IVA_RATES_NORMAL } from '../../lib/iva';
import { exportCajaExcel } from '../../lib/excel';
import { X, Download, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import ChipSelect from '../../components/ui/ChipSelect';

const INCOME_CATS = ['Invoice','Subscription','Grant','Other'];
const EXPENSE_CATS = ['Server','Salary','Travel','Marketing','Legal','Software','Office','Other'];

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
      <div style={{ background:'var(--ivory-alt)',borderRadius:16,padding:32,width:'100%',maxWidth:520,border:'1px solid var(--linea)',maxHeight:'90vh',overflowY:'auto' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20 }}>
          <h2 style={{ margin:0,fontSize:17,fontWeight:700,color:'var(--ink)' }}>{title}</h2>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'var(--muted)',cursor:'pointer' }}><X size={20}/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom:12 }}>
      <label style={{ fontSize:12,color:'var(--muted)',display:'block',marginBottom:5 }}>{label}</label>
      {children}
    </div>
  );
}

function MovimientoForm({ tipo, clientes, facturas, onSave, onClose }: {
  tipo: 'ingreso' | 'gasto';
  clientes: Cliente[];
  facturas: Factura[];
  onSave: (d: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [concepto, setConcepto]   = useState('');
  const [importe, setImporte]     = useState('');
  const [fecha, setFecha]         = useState(new Date().toISOString().split('T')[0]);
  const [categoria, setCategoria] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [facturaId, setFacturaId] = useState('');
  const [tipoIva, setTipoIva]     = useState<TipoIva>('normal');
  const [ivaRate, setIvaRate]     = useState(0);
  const [recurrente, setRecurrente] = useState(false);
  const [intervalo, setIntervalo] = useState('mensual');
  const [notas, setNotas]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState('');

  const imp = parseFloat(importe) || 0;
  const ivaImporte = calcIva(imp, ivaRate);
  const total = calcTotal(imp, ivaImporte);

  useEffect(() => { setIvaRate(getDefaultIvaRate(tipoIva)); }, [tipoIva]);

  const cats = tipo === 'ingreso' ? INCOME_CATS : EXPENSE_CATS;

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setErr('');
    try {
      await onSave({
        tipo, concepto, importe: imp, tipo_iva: tipoIva,
        iva_rate: ivaRate, iva_importe: ivaImporte,
        fecha, categoria: categoria || undefined,
        cliente_id: clienteId ? Number(clienteId) : undefined,
        factura_id: facturaId ? Number(facturaId) : undefined,
        recurrente, intervalo: recurrente ? intervalo : undefined,
        notas: notas || undefined,
      });
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit}>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',gap:10 }}>
        <div style={{ gridColumn:'span 2' }}>
          <Field label="Concepto *"><input value={concepto} onChange={e => setConcepto(e.target.value)} required placeholder={tipo==='ingreso'?'p. ej. Suscripción mensual La Bahía':'p. ej. Hosting VPS Hostinger'} /></Field>
        </div>
        <Field label="Importe (€)"><input type="number" value={importe} onChange={e => setImporte(e.target.value)} min={0} step={0.01} required /></Field>
        <Field label="Fecha"><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></Field>
        <Field label="Categoría">
          <ChipSelect
            value={categoria}
            onChange={setCategoria}
            options={cats.map(c => ({ value: c, label: c }))}
            allowEmpty
            emptyLabel="Seleccionar…"
          />
        </Field>
        <Field label="Tipo de IVA">
          <ChipSelect
            value={tipoIva}
            onChange={v => setTipoIva(v as TipoIva)}
            options={[
              { value: 'normal', label: 'Normal (con IVA)' },
              { value: 'intracomunitario', label: 'Inversión del sujeto pasivo (UE B2B)' },
              { value: 'exento', label: 'Exento' },
            ]}
          />
        </Field>
        {tipoIva === 'normal' && (
          <Field label="Porcentaje de IVA (%)">
            <ChipSelect
              value={String(ivaRate)}
              onChange={v => setIvaRate(Number(v))}
              options={IVA_RATES_NORMAL.map(r => ({ value: String(r), label: `${r}%` }))}
            />
          </Field>
        )}
        <Field label="Vincular a factura (opcional)">
          <ChipSelect
            value={facturaId}
            onChange={setFacturaId}
            options={facturas.filter(f => f.estado !== 'anulada').map(f => ({ value: String(f.id), label: `${f.numero} — ${f.cliente_nombre} (${formatEur(f.total)})` }))}
            allowEmpty
            emptyLabel="Ninguna"
            searchPlaceholder="Buscar factura…"
          />
        </Field>
        <Field label="Cliente (opcional)">
          <ChipSelect
            value={clienteId}
            onChange={setClienteId}
            options={clientes.map(c => ({ value: String(c.id), label: c.nombre }))}
            allowEmpty
            emptyLabel="Ninguno"
            searchPlaceholder="Buscar cliente…"
          />
        </Field>
        <div style={{ gridColumn:'span 2' }}>
          <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:12 }}>
            <input type="checkbox" id="rec" checked={recurrente} onChange={e => setRecurrente(e.target.checked)} style={{ width:'auto' }} />
            <label htmlFor="rec" style={{ fontSize:13,color:'var(--ink)',cursor:'pointer' }}>Recurrente</label>
            {recurrente && (
              <ChipSelect
                value={intervalo}
                onChange={setIntervalo}
                options={[{ value: 'mensual', label: 'Mensual' }, { value: 'trimestral', label: 'Trimestral' }]}
              />
            )}
          </div>
        </div>
        <div style={{ gridColumn:'span 2' }}>
          <Field label="Notas"><textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} /></Field>
        </div>
      </div>

      {/* Totals preview */}
      {imp > 0 && (
        <div style={{ background:'rgba(255,122,26,0.05)',borderRadius:8,padding:'10px 14px',marginBottom:12,fontSize:12 }}>
          <div style={{ display:'flex',justifyContent:'space-between' }}>
            <span style={{ color:'var(--muted)' }}>Importe</span>
            <span style={{ fontFamily:'JetBrains Mono, monospace',color:'var(--ink)' }}>{formatEur(imp)}</span>
          </div>
          <div style={{ display:'flex',justifyContent:'space-between' }}>
            <span style={{ color:'var(--muted)' }}>IVA ({ivaRate}%)</span>
            <span style={{ fontFamily:'JetBrains Mono, monospace',color:'var(--muted)' }}>{formatEur(ivaImporte)}</span>
          </div>
          <div style={{ display:'flex',justifyContent:'space-between',borderTop:'1px solid var(--linea)',paddingTop:6,marginTop:6 }}>
            <span style={{ fontWeight:700,color:'var(--ink)' }}>Total</span>
            <span style={{ fontFamily:'JetBrains Mono, monospace',fontWeight:700,color:'var(--naranja-text)' }}>{formatEur(total)}</span>
          </div>
        </div>
      )}

      {err && <div style={{ color:'var(--rojo-text)',fontSize:13,marginBottom:10 }}>{err}</div>}
      <div style={{ display:'flex',gap:10,justifyContent:'flex-end' }}>
        <button type="button" onClick={onClose} style={{ padding:'9px 20px',borderRadius:8,border:'1px solid var(--linea)',background:'none',color:'var(--muted)',cursor:'pointer' }}>Cancelar</button>
        <button type="submit" disabled={saving} style={{
          padding:'9px 20px',borderRadius:8,border:'none',
          background: tipo==='ingreso'?'rgba(23,129,127,0.2)':'rgba(229,72,77,0.2)',
          color: tipo==='ingreso'?'var(--verde-text)':'var(--rojo-text)',
          fontWeight:700,cursor:'pointer',
        }}>
          {saving ? 'Guardando...' : (tipo==='ingreso' ? '+ Añadir ingreso' : '- Añadir gasto')}
        </button>
      </div>
    </form>
  );
}

export default function Cash() {
  const [movimientos, setMov]     = useState<CajaMovimiento[]>([]);
  const [clientes, setClientes]   = useState<Cliente[]>([]);
  const [facturas, setFacturas]   = useState<Factura[]>([]);
  const [modal, setModal]         = useState<'ingreso' | 'gasto' | null>(null);
  const [loading, setLoading]     = useState(true);

  const load = () => Promise.all([
    apiFetch<CajaMovimiento[]>('/ops/caja'),
    apiFetch<Cliente[]>('/ops/clientes'),
    apiFetch<Factura[]>('/ops/facturas'),
  ]).then(([m, c, f]) => { setMov(m); setClientes(c); setFacturas(f); });

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function saveMov(data: Record<string, unknown>) {
    await apiFetch('/ops/caja', { method:'POST', body:JSON.stringify(data) });
    await load();
  }

  const income   = movimientos.filter(m => m.tipo==='ingreso').reduce((s,m) => s+m.importe, 0);
  const expenses = movimientos.filter(m => m.tipo==='gasto').reduce((s,m) => s+m.importe, 0);
  const balance  = income - expenses;

  if (loading) return <div style={{ color:'var(--muted)' }}>Cargando...</div>;

  return (
    <div>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24 }}>
        <h1 style={{ fontFamily:'Syne, sans-serif',fontSize:26,fontWeight:800,color:'var(--ink)',margin:0 }}>Caja</h1>
        <div style={{ display:'flex',gap:10 }}>
          <button onClick={() => exportCajaExcel(movimientos)} style={{ display:'flex',alignItems:'center',gap:6,padding:'9px 16px',background:'var(--ivory-alt)',border:'none',borderRadius:8,color:'var(--ink)',cursor:'pointer',fontSize:13 }}>
            <Download size={14}/> Exportar
          </button>
          <button onClick={() => setModal('gasto')} style={{ display:'flex',alignItems:'center',gap:6,padding:'9px 16px',background:'rgba(229,72,77,0.15)',border:'none',borderRadius:8,color:'var(--rojo-text)',fontWeight:700,cursor:'pointer',fontSize:13 }}>
            <TrendingDown size={14}/> Gasto
          </button>
          <button onClick={() => setModal('ingreso')} style={{ display:'flex',alignItems:'center',gap:6,padding:'9px 18px',background:'rgba(23,129,127,0.15)',border:'none',borderRadius:8,color:'var(--verde-text)',fontWeight:700,cursor:'pointer',fontSize:14 }}>
            <TrendingUp size={14}/> Ingreso
          </button>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display:'flex',gap:16,marginBottom:24 }}>
        {[
          { label:'Saldo de caja', value:balance, color: balance>=0?'var(--verde-text)':'var(--rojo-text)', icon:<Wallet size={28}/> },
          { label:'Total ingresos', value:income,    color:'var(--verde-text)', icon:<TrendingUp size={28}/> },
          { label:'Total gastos',   value:expenses,  color:'var(--rojo-text)', icon:<TrendingDown size={28}/> },
        ].map(c => (
          <div key={c.label} style={{ background:'var(--ivory-alt)',borderRadius:12,padding:'20px 24px',border:'1px solid var(--linea)',flex:1 }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start' }}>
              <div>
                <div style={{ fontSize:12,color:'var(--muted)',marginBottom:8 }}>{c.label}</div>
                <div style={{ fontFamily:'JetBrains Mono, monospace',fontSize:22,fontWeight:700,color:c.color }}>{formatEur(c.value)}</div>
              </div>
              <div style={{ color:'var(--ink)' }}>{c.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Movements list */}
      <div style={{ background:'var(--ivory-alt)',borderRadius:12,border:'1px solid var(--linea)',overflow:'hidden' }}>
        <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--linea)' }}>
              {['Fecha','Concepto','Categoría','Cliente','Importe','IVA'].map(h => (
                <th key={h} style={{ textAlign:'left',padding:'12px 16px',color:'var(--muted)',fontWeight:500,fontSize:12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {movimientos.length === 0 ? (
              <tr><td colSpan={6} style={{ padding:'24px',color:'var(--muted)',textAlign:'center' }}>Aún no hay movimientos</td></tr>
            ) : movimientos.map(m => (
              <tr key={m.id} style={{ borderBottom:'1px solid var(--linea-alta)' }}>
                <td style={{ padding:'10px 16px',color:'var(--muted)' }}>{formatDate(m.fecha)}</td>
                <td style={{ padding:'10px 16px',color:'var(--ink)',fontWeight:500 }}>
                  {m.concepto}
                  {m.recurrente && <span style={{ marginLeft:6,fontSize:10,color:'var(--muted-tint)',background:'rgba(94,109,114,0.1)',padding:'1px 6px',borderRadius:20 }}>recurrente</span>}
                </td>
                <td style={{ padding:'10px 16px',color:'var(--muted)',fontSize:12 }}>{m.categoria || '-'}</td>
                <td style={{ padding:'10px 16px',color:'var(--muted)',fontSize:12 }}>{m.cliente_nombre || '-'}</td>
                <td style={{ padding:'10px 16px',fontFamily:'JetBrains Mono, monospace',fontWeight:700,color:m.tipo==='ingreso'?'var(--verde-text)':'var(--rojo-text)' }}>
                  {m.tipo==='ingreso'?'+':'-'}{formatEur(m.importe)}
                </td>
                <td style={{ padding:'10px 16px',fontFamily:'JetBrains Mono, monospace',fontSize:12,color:'var(--muted)' }}>
                  {m.iva_rate>0 ? formatEur(m.iva_importe) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal==='ingreso'?'+ Nuevo ingreso':'- Nuevo gasto'} onClose={() => setModal(null)}>
          <MovimientoForm tipo={modal} clientes={clientes} facturas={facturas} onSave={saveMov} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
