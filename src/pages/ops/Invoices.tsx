import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../lib/opsFetch';
import type { Factura, FacturaLinea, Cliente, TipoIva, IvaJurisdiccion, EstadoFactura, TipoFactura } from '../../types';
import {
  formatEur, formatDate, isOverdue,
  calcIva, calcTotal, tipoIvaLabel,
  IVA_JURISDICCIONES, IVA_JURISDICCION_ORDER, jurisdiccionLabel, invoiceLegalNoteJurisdiccion, jurisdiccionFromFactura,
} from '../../lib/iva';
import { exportFacturasExcel } from '../../lib/excel';
import { generateInvoicePDF } from '../../lib/pdf';
import { Plus, X, Download, Printer, ChevronRight, Trash2 } from 'lucide-react';
import ChipSelect from '../../components/ui/ChipSelect';

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
      <div style={{ background:'var(--ivory-alt)',borderRadius:16,padding:32,width:'100%',maxWidth:wide?760:560,border:'1px solid var(--linea)',maxHeight:'92vh',overflowY:'auto' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24 }}>
          <h2 style={{ margin:0,fontSize:18,fontWeight:700,color:'var(--ink)' }}>{title}</h2>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'var(--muted)',cursor:'pointer' }}><X size={20}/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, span2 }: { label: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div style={{ marginBottom:12, ...(span2 ? { gridColumn:'span 2' } : {}) }}>
      <label style={{ fontSize:12,color:'var(--muted)',display:'block',marginBottom:5 }}>{label}</label>
      {children}
    </div>
  );
}

function StatusBadge({ estado }: { estado: string }) {
  const m: Record<string, [string,string]> = {
    draft:['rgba(15,46,56,0.15)','var(--muted-tint)'],
    sent:['rgba(23,129,127,0.15)','var(--teal-tint)'],
    collected:['rgba(23,129,127,0.15)','var(--teal-tint)'],
    overdue:['rgba(229,72,77,0.15)','var(--rojo-tint)'],
    cancelled:['rgba(15,46,56,0.15)','var(--muted-tint)'],
  };
  const [bg,color] = m[estado] || m.draft;
  return <span style={{ background:bg,color,borderRadius:20,padding:'3px 10px',fontSize:11,fontWeight:600 }}>{estado}</span>;
}

type NewLine = Omit<FacturaLinea, 'id' | 'factura_id' | 'orden'>;

function InvoiceForm({ clientes, onSave, onClose, preClienteId }: {
  clientes: Cliente[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
  preClienteId?: number;
}) {
  const today = new Date().toISOString().split('T')[0];
  const due30 = new Date(Date.now() + 30*864e5).toISOString().split('T')[0];

  const [nextNum, setNextNum] = useState('...');
  const [clienteId, setClienteId]     = useState<string>(preClienteId?.toString() || '');
  const [fechaEmision, setFechaEmision] = useState(today);
  const [fechaVenc, setFechaVenc]       = useState(due30);
  const [metodoPago, setMetodoPago]     = useState('Transferencia');
  const [jurisdiccion, setJurisdiccion] = useState<IvaJurisdiccion>('estonia');
  const [ivaRate, setIvaRate]           = useState(24);
  const tipoIva: TipoIva = IVA_JURISDICCIONES[jurisdiccion].tipoIva;   // régimen derivado
  const jCfg = IVA_JURISDICCIONES[jurisdiccion];
  const [tipo, setTipo]                 = useState<TipoFactura>('normal');
  const [intervalo, setIntervalo]       = useState('monthly');
  const [notas, setNotas]               = useState('');
  const [lineas, setLineas]             = useState<NewLine[]>([{ descripcion:'', cantidad:1, precio_unitario:0, importe:0 }]);
  const [saving, setSaving]             = useState(false);
  const [err, setErr]                   = useState('');

  useEffect(() => {
    apiFetch<{ numero: string }>('/ops/facturas/next-number').then(r => setNextNum(r.numero));
  }, []);

  // Al cambiar jurisdicción, ajusta la tasa a su default (24 EE / 21 ES / 0 UE / 0 exento).
  useEffect(() => {
    setIvaRate(IVA_JURISDICCIONES[jurisdiccion].defaultRate);
  }, [jurisdiccion]);

  const cliente = clientes.find(c => c.id === Number(clienteId));

  const subtotal = lineas.reduce((s, l) => s + l.importe, 0);
  const ivaImporte = calcIva(subtotal, ivaRate);
  const total = calcTotal(subtotal, ivaImporte);
  const legalNote = invoiceLegalNoteJurisdiccion(jurisdiccion, ivaRate);

  function setLinea(i: number, k: keyof NewLine, v: string | number) {
    setLineas(prev => {
      const n = [...prev];
      n[i] = { ...n[i], [k]: v };
      if (k === 'cantidad' || k === 'precio_unitario') {
        n[i].importe = Math.round(n[i].cantidad * n[i].precio_unitario * 100) / 100;
      }
      return n;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clienteId) { setErr('Select a client'); return; }
    setSaving(true); setErr('');
    try {
      await onSave({
        cliente_id: Number(clienteId),
        fecha_emision: fechaEmision,
        fecha_vencimiento: fechaVenc || null,
        metodo_pago: metodoPago,
        tipo_iva: tipoIva,
        iva_jurisdiccion: jurisdiccion,
        iva_rate: ivaRate,
        subtotal,
        iva_importe: ivaImporte,
        total,
        tipo,
        intervalo_recurrencia: tipo === 'recurring' ? intervalo : null,
        notas: notas || null,
        lineas: lineas.filter(l => l.descripcion.trim()),
      });
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit}>
      {/* Invoice number preview */}
      <div style={{ background:'rgba(255,122,26,0.08)',border:'1px solid rgba(255,122,26,0.2)',borderRadius:8,padding:'10px 16px',marginBottom:20,display:'flex',justifyContent:'space-between' }}>
        <span style={{ fontSize:13,color:'var(--muted-tint)' }}>Invoice number</span>
        <span style={{ fontFamily:'JetBrains Mono, monospace',fontWeight:700,color:'var(--naranja-tint)',fontSize:15 }}>{nextNum}</span>
      </div>

      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',gap:10 }}>
        <Field label="Client *" span2>
          <ChipSelect
            value={clienteId}
            onChange={setClienteId}
            options={clientes.map(c => ({ value: String(c.id), label: `${c.nombre}${c.vat_number ? ` (${c.vat_number})` : ''}` }))}
            allowEmpty
            emptyLabel="Select client…"
            searchPlaceholder="Buscar cliente…"
          />
        </Field>

        <Field label="Issue Date"><input type="date" value={fechaEmision} onChange={e => setFechaEmision(e.target.value)} /></Field>
        <Field label="Due Date"><input type="date" value={fechaVenc} onChange={e => setFechaVenc(e.target.value)} /></Field>
        <Field label="Payment Method">
          <ChipSelect
            value={metodoPago}
            onChange={setMetodoPago}
            options={['Transferencia', 'SEPA', 'Stripe', 'Cash'].map(x => ({ value: x, label: x }))}
          />
        </Field>
        <Field label="Type">
          <ChipSelect
            value={tipo}
            onChange={v => setTipo(v as TipoFactura)}
            options={[{ value: 'normal', label: 'Normal' }, { value: 'recurring', label: 'Recurring' }]}
          />
        </Field>
        {tipo === 'recurring' && (
          <Field label="Interval">
            <ChipSelect
              value={intervalo}
              onChange={setIntervalo}
              options={[{ value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }]}
            />
          </Field>
        )}

        {/* Jurisdicción de IVA — determina régimen, tasas y nota legal */}
        <Field label="Jurisdicción de IVA" span2>
          <ChipSelect
            value={jurisdiccion}
            onChange={v => setJurisdiccion(v as IvaJurisdiccion)}
            options={IVA_JURISDICCION_ORDER.map(j => ({ value: j, label: jurisdiccionLabel(j) }))}
          />
        </Field>

        {/* Aviso reverse charge (Europeo) */}
        {jCfg.reverseCharge && (
          <div style={{ gridColumn:'span 2',background:'rgba(255,122,26,0.08)',border:'1px solid rgba(255,122,26,0.25)',borderRadius:8,padding:'10px 14px',fontSize:12,color:'var(--naranja-tint)' }}>
            <strong>Reverse Charge (Art. 44):</strong> IVA = 0%. Se requiere el número VAT del cliente. La nota legal aparecerá en el PDF.
            {cliente && !cliente.vat_number && (
              <div style={{ marginTop:4,color:'var(--rojo-text)' }}>⚠ Este cliente no tiene VAT — añádelo en Clientes antes de emitir la factura.</div>
            )}
          </div>
        )}

        {jCfg.rates.length > 1 && (
          <Field label={`Tasa de IVA ${jurisdiccion === 'spain' ? 'española' : 'estonia'} (%)`}>
            <ChipSelect
              value={String(ivaRate)}
              onChange={v => setIvaRate(Number(v))}
              options={jCfg.rates.map(r => ({ value: String(r), label: `${r}%` }))}
            />
          </Field>
        )}
      </div>

      {/* Line items */}
      <div style={{ margin:'16px 0 8px',fontSize:13,fontWeight:700,color:'var(--naranja-text)',borderBottom:'1px solid var(--linea)',paddingBottom:8 }}>Line Items</div>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--linea)' }}>
              {['Description','Qty','Unit Price','Amount',''].map(h => (
                <th key={h} style={{ textAlign:'left',padding:'6px 8px',color:'var(--muted)',fontWeight:500,fontSize:11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i}>
                <td style={{ padding:'4px 6px' }}>
                  <input value={l.descripcion} onChange={e => setLinea(i,'descripcion',e.target.value)} placeholder="Service description" />
                </td>
                <td style={{ padding:'4px 6px',width:60 }}>
                  <input type="number" value={l.cantidad} min={0} onChange={e => setLinea(i,'cantidad',Number(e.target.value))} style={{ width:60 }} />
                </td>
                <td style={{ padding:'4px 6px',width:100 }}>
                  <input type="number" value={l.precio_unitario} min={0} step={0.01} onChange={e => setLinea(i,'precio_unitario',Number(e.target.value))} style={{ width:100 }} />
                </td>
                <td style={{ padding:'4px 6px',width:90,fontFamily:'JetBrains Mono, monospace',color:'var(--ink)',textAlign:'right' }}>
                  {formatEur(l.importe)}
                </td>
                <td style={{ padding:'4px 6px',width:30 }}>
                  {lineas.length > 1 && (
                    <button type="button" onClick={() => setLineas(p => p.filter((_,j) => j !== i))} style={{ background:'none',border:'none',color:'var(--rojo-text)',cursor:'pointer',padding:2 }}>
                      <Trash2 size={14}/>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => setLineas(p => [...p, { descripcion:'',cantidad:1,precio_unitario:0,importe:0 }])}
        style={{ marginTop:8,background:'none',border:'1px dashed var(--linea)',borderRadius:8,padding:'6px 16px',color:'var(--muted)',cursor:'pointer',fontSize:12 }}>
        + Add line
      </button>

      {/* Totals */}
      <div style={{ marginTop:16,borderTop:'1px solid var(--linea)',paddingTop:12 }}>
        <div style={{ display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6,fontSize:13 }}>
          <div style={{ display:'flex',gap:20 }}>
            <span style={{ color:'var(--muted)' }}>Subtotal</span>
            <span style={{ fontFamily:'JetBrains Mono, monospace',color:'var(--ink)',minWidth:90,textAlign:'right' }}>{formatEur(subtotal)}</span>
          </div>
          <div style={{ display:'flex',gap:20 }}>
            <span style={{ color: tipoIva==='normal'?'var(--muted)':'var(--naranja-text)' }}>
              {tipoIva==='normal' ? `VAT (${ivaRate}%)` : tipoIvaLabel(tipoIva)}
            </span>
            <span style={{ fontFamily:'JetBrains Mono, monospace',color: tipoIva==='normal'?'var(--ink)':'var(--naranja-text)',minWidth:90,textAlign:'right' }}>{formatEur(ivaImporte)}</span>
          </div>
          <div style={{ display:'flex',gap:20,borderTop:'1px solid var(--linea)',paddingTop:6 }}>
            <span style={{ fontWeight:700,color:'var(--ink)' }}>TOTAL</span>
            <span style={{ fontFamily:'JetBrains Mono, monospace',fontWeight:700,fontSize:16,color:'var(--naranja-text)',minWidth:90,textAlign:'right' }}>{formatEur(total)}</span>
          </div>
        </div>
        {legalNote && (
          <div style={{ marginTop:12,padding:'8px 12px',background:'rgba(255,122,26,0.05)',borderRadius:8,fontSize:11,color:'var(--muted-tint)',borderLeft:'3px solid var(--pulse)' }}>
            {legalNote}
          </div>
        )}
      </div>

      <Field label="Notes"><textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Internal notes or additional info" /></Field>

      {err && <div style={{ color:'var(--rojo-text)',fontSize:13,marginBottom:10 }}>{err}</div>}
      <div style={{ display:'flex',gap:10,justifyContent:'flex-end',marginTop:8 }}>
        <button type="button" onClick={onClose} style={{ padding:'9px 20px',borderRadius:8,border:'1px solid var(--linea)',background:'none',color:'var(--muted)',cursor:'pointer' }}>Cancel</button>
        <button type="submit" disabled={saving} style={{ padding:'9px 20px',borderRadius:8,border:'none',background:'var(--pulse)',color:'var(--petrol)',fontWeight:700,cursor:'pointer' }}>
          {saving ? 'Saving...' : 'Create Invoice'}
        </button>
      </div>
    </form>
  );
}

export default function Invoices() {
  const [facturas, setFacturas]       = useState<Factura[]>([]);
  const [clientes, setClientes]       = useState<Cliente[]>([]);
  const [filterEstado, setFilter]     = useState<'all' | EstadoFactura>('all');
  const [showModal, setShowModal]     = useState(false);
  const [selected, setSelected]       = useState<Factura | null>(null);
  const [selectedLineas, setSelLineas]= useState<FacturaLinea[]>([]);
  const [loading, setLoading]         = useState(true);

  const load = useCallback(() => Promise.all([
    apiFetch<Factura[]>('/ops/facturas'),
    apiFetch<Cliente[]>('/ops/clientes'),
  ]).then(([f, c]) => { setFacturas(f); setClientes(c); }), []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const enriched = facturas.map(f => ({ ...f, estado: isOverdue(f) ? 'overdue' as const : f.estado }));
  const filtered = enriched.filter(f => filterEstado === 'all' || f.estado === filterEstado);

  const collected   = enriched.filter(f => f.estado==='collected').reduce((s,f)=>s+f.total,0);
  const outstanding = enriched.filter(f=>['sent','overdue'].includes(f.estado)).reduce((s,f)=>s+f.total,0);

  async function createInvoice(data: Record<string, unknown>) {
    await apiFetch('/ops/facturas', { method:'POST', body:JSON.stringify(data) });
    await load();
  }

  async function updateEstado(id: number, estado: EstadoFactura, extra: Record<string, unknown> = {}) {
    const updated = await apiFetch<Factura>(`/ops/facturas/${id}`, { method:'PUT', body:JSON.stringify({ estado, ...extra }) });
    // If collected → auto-create cash income entry
    if (estado === 'collected') {
      const f = enriched.find(x => x.id === id);
      if (f) {
        await apiFetch('/ops/caja', {
          method: 'POST',
          body: JSON.stringify({
            tipo: 'income', concepto: `Invoice ${f.numero}`,
            importe: f.total, tipo_iva: f.tipo_iva, iva_rate: f.iva_rate,
            iva_importe: f.iva_importe, fecha: new Date().toISOString().split('T')[0],
            categoria: 'Invoice', cliente_id: f.cliente_id, factura_id: f.id,
          }),
        });
      }
    }
    await load();
    if (selected?.id === id) setSelected({ ...selected, ...updated });
  }

  async function openDetail(f: Factura) {
    setSelected(f);
    const lineas = await apiFetch<FacturaLinea[]>(`/ops/facturas/${f.id}/lineas`);
    setSelLineas(lineas);
  }

  async function printInvoice() {
    if (!selected) return;
    generateInvoicePDF(selected, selectedLineas);
  }

  if (loading) return <div style={{ color:'var(--muted)' }}>Loading...</div>;

  const ESTADOS_FILTER: ('all' | EstadoFactura)[] = ['all','draft','sent','collected','overdue'];

  return (
    <div>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24 }}>
        <h1 style={{ fontFamily:'Syne, sans-serif',fontSize:26,fontWeight:800,color:'var(--ink)',margin:0 }}>
          Invoices
        </h1>
        <div style={{ display:'flex',gap:10 }}>
          <button onClick={() => exportFacturasExcel(enriched)} style={{ display:'flex',alignItems:'center',gap:6,padding:'9px 16px',background:'var(--ivory-alt)',border:'none',borderRadius:8,color:'var(--ink)',cursor:'pointer',fontSize:13 }}>
            <Download size={14}/> Export
          </button>
          <button onClick={() => setShowModal(true)} style={{ display:'flex',alignItems:'center',gap:6,padding:'9px 18px',background:'var(--pulse)',border:'none',borderRadius:8,color:'var(--petrol)',fontWeight:700,cursor:'pointer',fontSize:14 }}>
            <Plus size={16}/> New Invoice
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display:'flex',gap:16,marginBottom:24 }}>
        <div style={{ background:'var(--ivory-alt)',borderRadius:12,padding:'16px 20px',border:'1px solid var(--linea)',flex:1 }}>
          <div style={{ fontSize:12,color:'var(--muted)',marginBottom:4 }}>Collected</div>
          <div style={{ fontFamily:'JetBrains Mono, monospace',fontSize:20,fontWeight:700,color:'var(--verde-text)' }}>{formatEur(collected)}</div>
        </div>
        <div style={{ background:'var(--ivory-alt)',borderRadius:12,padding:'16px 20px',border:'1px solid var(--linea)',flex:1 }}>
          <div style={{ fontSize:12,color:'var(--muted)',marginBottom:4 }}>Outstanding</div>
          <div style={{ fontFamily:'JetBrains Mono, monospace',fontSize:20,fontWeight:700,color:'var(--naranja-text)' }}>{formatEur(outstanding)}</div>
        </div>
      </div>

      {/* Status filters */}
      <div style={{ display:'flex',gap:8,marginBottom:20 }}>
        {ESTADOS_FILTER.map(e => (
          <button key={e} onClick={() => setFilter(e)} style={{
            padding:'5px 14px',borderRadius:20,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,
            background: filterEstado===e?'var(--pulse)':'var(--ivory-alt)',
            color: filterEstado===e?'var(--petrol)':'var(--muted)',
          }}>
            {e==='all'?'All':e.charAt(0).toUpperCase()+e.slice(1)}
          </button>
        ))}
      </div>

      {/* Invoice table */}
      <div style={{ background:'var(--ivory-alt)',borderRadius:12,border:'1px solid var(--linea)',overflow:'hidden' }}>
        <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--linea)' }}>
              {['Number','Client','VAT Type','Date','Due','Total','Status',''].map(h => (
                <th key={h} style={{ textAlign:'left',padding:'12px 16px',color:'var(--muted)',fontWeight:500,fontSize:12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding:'24px',color:'var(--muted)',textAlign:'center' }}>No invoices found</td></tr>
            ) : filtered.map(f => (
              <tr key={f.id} style={{ borderBottom:'1px solid var(--linea-alta)',cursor:'pointer' }} onClick={() => openDetail(f)}>
                <td style={{ padding:'10px 16px',fontFamily:'JetBrains Mono, monospace',fontSize:12,color:'var(--naranja-text)' }}>{f.numero}</td>
                <td style={{ padding:'10px 16px',color:'var(--ink)',fontWeight:500 }}>{f.cliente_nombre}</td>
                <td style={{ padding:'10px 16px' }}>
                  {f.tipo_iva === 'intracomunitario' && <span style={{ fontSize:11,color:'var(--naranja-tint)',background:'rgba(255,122,26,0.1)',padding:'2px 8px',borderRadius:20 }}>Reverse Charge</span>}
                  {f.tipo_iva === 'exento' && <span style={{ fontSize:11,color:'var(--muted)' }}>Exempt</span>}
                  {f.tipo_iva === 'normal' && <span style={{ fontSize:11,color:'var(--muted)' }}>{f.iva_rate}% VAT</span>}
                </td>
                <td style={{ padding:'10px 16px',color:'var(--muted)' }}>{formatDate(f.fecha_emision)}</td>
                <td style={{ padding:'10px 16px',color:f.estado==='overdue'?'var(--rojo-text)':'var(--muted)' }}>
                  {f.fecha_vencimiento ? formatDate(f.fecha_vencimiento) : '-'}
                </td>
                <td style={{ padding:'10px 16px',fontFamily:'JetBrains Mono, monospace',fontWeight:600,color:'var(--ink)' }}>{formatEur(f.total)}</td>
                <td style={{ padding:'10px 16px' }}><StatusBadge estado={f.estado} /></td>
                <td style={{ padding:'10px 16px',color:'var(--muted)' }}><ChevronRight size={14}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invoice detail modal */}
      {selected && (
        <Modal title={`Invoice ${selected.numero}`} onClose={() => setSelected(null)} wide>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',gap:16,marginBottom:16,fontSize:13 }}>
            <div>
              <div style={{ color:'var(--muted)',fontSize:11,marginBottom:4 }}>Client</div>
              <div style={{ color:'var(--ink)',fontWeight:600 }}>{selected.cliente_nombre}</div>
              {selected.vat_number && <div style={{ color:'var(--muted)',fontSize:12 }}>VAT: {selected.vat_number}</div>}
            </div>
            <div>
              <div style={{ color:'var(--muted)',fontSize:11,marginBottom:4 }}>Amount</div>
              <div style={{ fontFamily:'JetBrains Mono, monospace',fontSize:20,fontWeight:700,color:'var(--naranja-text)' }}>{formatEur(selected.total)}</div>
              <div style={{ fontSize:12,color:'var(--muted)' }}>{jurisdiccionLabel(selected.iva_jurisdiccion ?? jurisdiccionFromFactura(selected.tipo_iva, selected.iva_rate))}{selected.tipo_iva==='normal'?` (${selected.iva_rate}%)`:' = 0%'}</div>
            </div>
            <div>
              <div style={{ color:'var(--muted)',fontSize:11 }}>Issued / Due</div>
              <div style={{ color:'var(--ink)' }}>{formatDate(selected.fecha_emision)} → {selected.fecha_vencimiento ? formatDate(selected.fecha_vencimiento) : 'No due date'}</div>
            </div>
            <div>
              <div style={{ color:'var(--muted)',fontSize:11 }}>Status</div>
              <StatusBadge estado={selected.estado} />
            </div>
          </div>

          {/* Legal note preview */}
          {(() => { const jSel = selected.iva_jurisdiccion ?? jurisdiccionFromFactura(selected.tipo_iva, selected.iva_rate); const note = invoiceLegalNoteJurisdiccion(jSel, selected.iva_rate); return note ? (
            <div style={{ padding:'10px 14px',background:'rgba(255,122,26,0.06)',borderLeft:'3px solid var(--pulse)',borderRadius:8,fontSize:12,color:'var(--muted-tint)',marginBottom:16 }}>
              {note}
            </div>
          ) : null; })()}

          {/* Line items */}
          {selectedLineas.length > 0 && (
            <table style={{ width:'100%',borderCollapse:'collapse',fontSize:12,marginBottom:16 }}>
              <thead><tr style={{ borderBottom:'1px solid var(--linea)' }}>
                {['Description','Qty','Unit Price','Amount'].map(h => (
                  <th key={h} style={{ textAlign:'left',padding:'6px 8px',color:'var(--muted)',fontWeight:500 }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {selectedLineas.map(l => (
                  <tr key={l.id} style={{ borderBottom:'1px solid var(--linea-alta)' }}>
                    <td style={{ padding:'6px 8px',color:'var(--ink)' }}>{l.descripcion}</td>
                    <td style={{ padding:'6px 8px',color:'var(--muted)' }}>{l.cantidad}</td>
                    <td style={{ padding:'6px 8px',fontFamily:'JetBrains Mono, monospace',color:'var(--muted)' }}>{formatEur(l.precio_unitario)}</td>
                    <td style={{ padding:'6px 8px',fontFamily:'JetBrains Mono, monospace',fontWeight:600,color:'var(--ink)' }}>{formatEur(l.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Status transitions */}
          <div style={{ display:'flex',gap:10,flexWrap:'wrap',borderTop:'1px solid var(--linea)',paddingTop:16 }}>
            {selected.estado === 'draft' && (
              <button onClick={() => updateEstado(selected.id,'sent')} style={{ padding:'8px 18px',borderRadius:8,border:'none',background:'rgba(23,129,127,0.15)',color:'var(--teal-tint)',cursor:'pointer',fontWeight:600 }}>
                Mark as Sent
              </button>
            )}
            {selected.estado === 'sent' && (
              <button onClick={() => updateEstado(selected.id,'collected')} style={{ padding:'8px 18px',borderRadius:8,border:'none',background:'rgba(23,129,127,0.15)',color:'var(--verde-text)',cursor:'pointer',fontWeight:600 }}>
                Mark as Collected → Auto-add to Cash
              </button>
            )}
            {(selected.estado === 'draft' || selected.estado === 'sent') && (
              <button onClick={() => updateEstado(selected.id,'cancelled')} style={{ padding:'8px 18px',borderRadius:8,border:'none',background:'rgba(15,46,56,0.1)',color:'var(--muted)',cursor:'pointer' }}>
                Cancel
              </button>
            )}
            <button onClick={printInvoice} style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 18px',borderRadius:8,border:'1px solid var(--linea)',background:'none',color:'var(--ink)',cursor:'pointer' }}>
              <Printer size={14}/> Download PDF
            </button>
          </div>
        </Modal>
      )}

      {showModal && (
        <Modal title="New Invoice" onClose={() => setShowModal(false)} wide>
          <InvoiceForm clientes={clientes} onSave={createInvoice} onClose={() => setShowModal(false)} />
        </Modal>
      )}
    </div>
  );
}
