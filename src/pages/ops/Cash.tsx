import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/opsFetch';
import type { CajaMovimiento, Cliente, Factura, TipoIva } from '../../types';
import { formatEur, formatDate, calcIva, calcTotal, getDefaultIvaRate, IVA_RATES_NORMAL } from '../../lib/iva';
import { exportCajaExcel } from '../../lib/excel';
import { X, Download, TrendingUp, TrendingDown, Wallet } from 'lucide-react';

const INCOME_CATS = ['Invoice','Subscription','Grant','Other'];
const EXPENSE_CATS = ['Server','Salary','Travel','Marketing','Legal','Software','Office','Other'];

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
      <div style={{ background:'#112240',borderRadius:16,padding:32,width:'100%',maxWidth:520,border:'1px solid #1a2f50',maxHeight:'90vh',overflowY:'auto' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20 }}>
          <h2 style={{ margin:0,fontSize:17,fontWeight:700,color:'#E8F0FE' }}>{title}</h2>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'#8892B0',cursor:'pointer' }}><X size={20}/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom:12 }}>
      <label style={{ fontSize:12,color:'#8892B0',display:'block',marginBottom:5 }}>{label}</label>
      {children}
    </div>
  );
}

function MovimientoForm({ tipo, clientes, facturas, onSave, onClose }: {
  tipo: 'income' | 'expense';
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
  const [intervalo, setIntervalo] = useState('monthly');
  const [notas, setNotas]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState('');

  const imp = parseFloat(importe) || 0;
  const ivaImporte = calcIva(imp, ivaRate);
  const total = calcTotal(imp, ivaImporte);

  useEffect(() => { setIvaRate(getDefaultIvaRate(tipoIva)); }, [tipoIva]);

  const cats = tipo === 'income' ? INCOME_CATS : EXPENSE_CATS;

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
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
        <div style={{ gridColumn:'span 2' }}>
          <Field label="Concept *"><input value={concepto} onChange={e => setConcepto(e.target.value)} required placeholder={tipo==='income'?'e.g. Monthly subscription La Bahía':'e.g. VPS hosting Hostinger'} /></Field>
        </div>
        <Field label="Amount (€)"><input type="number" value={importe} onChange={e => setImporte(e.target.value)} min={0} step={0.01} required /></Field>
        <Field label="Date"><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></Field>
        <Field label="Category">
          <select value={categoria} onChange={e => setCategoria(e.target.value)}>
            <option value="">Select...</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="VAT Type">
          <select value={tipoIva} onChange={e => setTipoIva(e.target.value as TipoIva)}>
            <option value="normal">Normal (with VAT)</option>
            <option value="intracomunitario">Reverse Charge (EU B2B)</option>
            <option value="exento">Exempt</option>
          </select>
        </Field>
        {tipoIva === 'normal' && (
          <Field label="VAT Rate (%)">
            <select value={ivaRate} onChange={e => setIvaRate(Number(e.target.value))}>
              {IVA_RATES_NORMAL.map(r => <option key={r} value={r}>{r}%</option>)}
            </select>
          </Field>
        )}
        <Field label="Link to invoice (optional)">
          <select value={facturaId} onChange={e => setFacturaId(e.target.value)}>
            <option value="">None</option>
            {facturas.filter(f => f.estado !== 'cancelled').map(f => (
              <option key={f.id} value={f.id}>{f.numero} — {f.cliente_nombre} ({formatEur(f.total)})</option>
            ))}
          </select>
        </Field>
        <Field label="Client (optional)">
          <select value={clienteId} onChange={e => setClienteId(e.target.value)}>
            <option value="">None</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Field>
        <div style={{ gridColumn:'span 2' }}>
          <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:12 }}>
            <input type="checkbox" id="rec" checked={recurrente} onChange={e => setRecurrente(e.target.checked)} style={{ width:'auto' }} />
            <label htmlFor="rec" style={{ fontSize:13,color:'#E8F0FE',cursor:'pointer' }}>Recurring</label>
            {recurrente && (
              <select value={intervalo} onChange={e => setIntervalo(e.target.value)} style={{ width:'auto',padding:'4px 10px' }}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            )}
          </div>
        </div>
        <div style={{ gridColumn:'span 2' }}>
          <Field label="Notes"><textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} /></Field>
        </div>
      </div>

      {/* Totals preview */}
      {imp > 0 && (
        <div style={{ background:'rgba(255,140,0,0.05)',borderRadius:8,padding:'10px 14px',marginBottom:12,fontSize:12 }}>
          <div style={{ display:'flex',justifyContent:'space-between' }}>
            <span style={{ color:'#8892B0' }}>Amount</span>
            <span style={{ fontFamily:'JetBrains Mono, monospace',color:'#E8F0FE' }}>{formatEur(imp)}</span>
          </div>
          <div style={{ display:'flex',justifyContent:'space-between' }}>
            <span style={{ color:'#8892B0' }}>VAT ({ivaRate}%)</span>
            <span style={{ fontFamily:'JetBrains Mono, monospace',color:'#8892B0' }}>{formatEur(ivaImporte)}</span>
          </div>
          <div style={{ display:'flex',justifyContent:'space-between',borderTop:'1px solid #1a2f50',paddingTop:6,marginTop:6 }}>
            <span style={{ fontWeight:700,color:'#E8F0FE' }}>Total</span>
            <span style={{ fontFamily:'JetBrains Mono, monospace',fontWeight:700,color:'#FF8C00' }}>{formatEur(total)}</span>
          </div>
        </div>
      )}

      {err && <div style={{ color:'#FF4757',fontSize:13,marginBottom:10 }}>{err}</div>}
      <div style={{ display:'flex',gap:10,justifyContent:'flex-end' }}>
        <button type="button" onClick={onClose} style={{ padding:'9px 20px',borderRadius:8,border:'1px solid #1a2f50',background:'none',color:'#8892B0',cursor:'pointer' }}>Cancel</button>
        <button type="submit" disabled={saving} style={{
          padding:'9px 20px',borderRadius:8,border:'none',
          background: tipo==='income'?'rgba(67,233,123,0.2)':'rgba(255,71,87,0.2)',
          color: tipo==='income'?'#43E97B':'#FF4757',
          fontWeight:700,cursor:'pointer',
        }}>
          {saving ? 'Saving...' : (tipo==='income' ? '+ Add Income' : '- Add Expense')}
        </button>
      </div>
    </form>
  );
}

export default function Cash() {
  const [movimientos, setMov]     = useState<CajaMovimiento[]>([]);
  const [clientes, setClientes]   = useState<Cliente[]>([]);
  const [facturas, setFacturas]   = useState<Factura[]>([]);
  const [modal, setModal]         = useState<'income' | 'expense' | null>(null);
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

  const income   = movimientos.filter(m => m.tipo==='income').reduce((s,m) => s+m.importe, 0);
  const expenses = movimientos.filter(m => m.tipo==='expense').reduce((s,m) => s+m.importe, 0);
  const balance  = income - expenses;

  if (loading) return <div style={{ color:'#8892B0' }}>Loading...</div>;

  return (
    <div>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24 }}>
        <h1 style={{ fontFamily:'Syne, sans-serif',fontSize:26,fontWeight:800,color:'#E8F0FE',margin:0 }}>Cash</h1>
        <div style={{ display:'flex',gap:10 }}>
          <button onClick={() => exportCajaExcel(movimientos)} style={{ display:'flex',alignItems:'center',gap:6,padding:'9px 16px',background:'#1a2f50',border:'none',borderRadius:8,color:'#E8F0FE',cursor:'pointer',fontSize:13 }}>
            <Download size={14}/> Export
          </button>
          <button onClick={() => setModal('expense')} style={{ display:'flex',alignItems:'center',gap:6,padding:'9px 16px',background:'rgba(255,71,87,0.15)',border:'none',borderRadius:8,color:'#FF4757',fontWeight:700,cursor:'pointer',fontSize:13 }}>
            <TrendingDown size={14}/> Expense
          </button>
          <button onClick={() => setModal('income')} style={{ display:'flex',alignItems:'center',gap:6,padding:'9px 18px',background:'rgba(67,233,123,0.15)',border:'none',borderRadius:8,color:'#43E97B',fontWeight:700,cursor:'pointer',fontSize:14 }}>
            <TrendingUp size={14}/> Income
          </button>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display:'flex',gap:16,marginBottom:24 }}>
        {[
          { label:'Cash Balance', value:balance, color: balance>=0?'#43E97B':'#FF4757', icon:<Wallet size={28}/> },
          { label:'Total Income',   value:income,    color:'#43E97B', icon:<TrendingUp size={28}/> },
          { label:'Total Expenses', value:expenses,  color:'#FF4757', icon:<TrendingDown size={28}/> },
        ].map(c => (
          <div key={c.label} style={{ background:'#112240',borderRadius:12,padding:'20px 24px',border:'1px solid #1a2f50',flex:1 }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start' }}>
              <div>
                <div style={{ fontSize:12,color:'#8892B0',marginBottom:8 }}>{c.label}</div>
                <div style={{ fontFamily:'JetBrains Mono, monospace',fontSize:22,fontWeight:700,color:c.color }}>{formatEur(c.value)}</div>
              </div>
              <div style={{ color:'#1a2f50' }}>{c.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Movements list */}
      <div style={{ background:'#112240',borderRadius:12,border:'1px solid #1a2f50',overflow:'hidden' }}>
        <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid #1a2f50' }}>
              {['Date','Concept','Category','Client','Amount','VAT'].map(h => (
                <th key={h} style={{ textAlign:'left',padding:'12px 16px',color:'#8892B0',fontWeight:500,fontSize:12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {movimientos.length === 0 ? (
              <tr><td colSpan={6} style={{ padding:'24px',color:'#8892B0',textAlign:'center' }}>No movements yet</td></tr>
            ) : movimientos.map(m => (
              <tr key={m.id} style={{ borderBottom:'1px solid #0A192F' }}>
                <td style={{ padding:'10px 16px',color:'#8892B0' }}>{formatDate(m.fecha)}</td>
                <td style={{ padding:'10px 16px',color:'#E8F0FE',fontWeight:500 }}>
                  {m.concepto}
                  {m.recurrente && <span style={{ marginLeft:6,fontSize:10,color:'#A78BFA',background:'rgba(167,139,250,0.1)',padding:'1px 6px',borderRadius:20 }}>recurring</span>}
                </td>
                <td style={{ padding:'10px 16px',color:'#8892B0',fontSize:12 }}>{m.categoria || '-'}</td>
                <td style={{ padding:'10px 16px',color:'#8892B0',fontSize:12 }}>{m.cliente_nombre || '-'}</td>
                <td style={{ padding:'10px 16px',fontFamily:'JetBrains Mono, monospace',fontWeight:700,color:m.tipo==='income'?'#43E97B':'#FF4757' }}>
                  {m.tipo==='income'?'+':'-'}{formatEur(m.importe)}
                </td>
                <td style={{ padding:'10px 16px',fontFamily:'JetBrains Mono, monospace',fontSize:12,color:'#8892B0' }}>
                  {m.iva_rate>0 ? formatEur(m.iva_importe) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal==='income'?'+ New Income':'- New Expense'} onClose={() => setModal(null)}>
          <MovimientoForm tipo={modal} clientes={clientes} facturas={facturas} onSave={saveMov} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
