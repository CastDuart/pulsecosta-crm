import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/opsFetch';
import type { Visita, Cliente } from '../../types';
import { formatDate } from '../../lib/iva';
import { exportVisitasExcel } from '../../lib/excel';
import { Plus, X, Download, UserCheck } from 'lucide-react';

type VisitaEstado = Visita['estado'];
type VisitaPrioridad = Visita['prioridad'];

const PLANES = ['Premium Local €29/mes', 'Pro BI €59/mes', 'Hotel Analytics €129/mes', 'Hotel Elite €429/mes', 'Other'];
const ESTADOS: VisitaEstado[] = ['pending', 'follow_up', 'closed', 'lost'];
const ESTADO_LABEL: Record<VisitaEstado, string> = { pending:'Pending', follow_up:'Follow-up', closed:'Closed', lost:'Lost' };
const ESTADO_COLOR: Record<VisitaEstado, string> = { pending:'var(--naranja-text)', follow_up:'var(--teal-accent)', closed:'var(--verde-text)', lost:'var(--muted)' };

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
      <div style={{ background:'var(--ivory-alt)',borderRadius:16,padding:32,width:'100%',maxWidth:620,border:'1px solid var(--linea)',maxHeight:'90vh',overflowY:'auto' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24 }}>
          <h2 style={{ margin:0,fontSize:18,fontWeight:700,color:'var(--ink)' }}>{title}</h2>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'var(--muted)',cursor:'pointer' }}><X size={20}/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:12,color:'var(--muted)',display:'block',marginBottom:5 }}>{label}</label>
      {children}
    </div>
  );
}

function VisitaForm({ initial, clientes, onSave, onClose }: {
  initial?: Partial<Visita>; clientes: Cliente[];
  onSave: (d: Partial<Visita>) => Promise<void>; onClose: () => void;
}) {
  const [f, setF] = useState({
    venue: initial?.venue || '',
    ciudad: initial?.ciudad || '',
    direccion: initial?.direccion || '',
    contacto: initial?.contacto || '',
    telefono: initial?.telefono || '',
    email: initial?.email || '',
    vat_number: initial?.vat_number || '',
    fecha: initial?.fecha || new Date().toISOString().split('T')[0],
    plan: initial?.plan || '',
    estado: initial?.estado || 'pending' as VisitaEstado,
    prioridad: initial?.prioridad || 'medium' as VisitaPrioridad,
    propuesta_enviada: initial?.propuesta_enviada || false,
    fecha_seguimiento: initial?.fecha_seguimiento || '',
    proxima_accion: initial?.proxima_accion || '',
    notas: initial?.notas || '',
    cliente_id: initial?.cliente_id || '' as number | '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setErr('');
    try {
      await onSave({ ...f, cliente_id: f.cliente_id === '' ? undefined : Number(f.cliente_id) });
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit}>
      {/* Prospect / Company */}
      <div style={{ fontSize:13,fontWeight:700,color:'var(--naranja-text)',marginBottom:12,borderBottom:'1px solid var(--linea)',paddingBottom:8 }}>Prospect / Company</div>
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
        <div style={{ gridColumn:'span 2' }}>
          <Field label="Venue / Company *"><input value={f.venue} onChange={set('venue')} required /></Field>
        </div>
        <Field label="City"><input value={f.ciudad} onChange={set('ciudad')} /></Field>
        <Field label="Street Address"><input value={f.direccion} onChange={set('direccion')} /></Field>
        <Field label="Contact person"><input value={f.contacto} onChange={set('contacto')} /></Field>
        <Field label="Phone"><input value={f.telefono} onChange={set('telefono')} /></Field>
        <Field label="Email"><input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="VAT Number"><input value={f.vat_number} onChange={set('vat_number')} placeholder="ESB12345678" /></Field>
      </div>

      {/* Visit details */}
      <div style={{ fontSize:13,fontWeight:700,color:'var(--naranja-text)',margin:'16px 0 12px',borderBottom:'1px solid var(--linea)',paddingBottom:8 }}>Visit Details</div>
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
        <Field label="Existing client (optional — only for upsell visits)">
          <select value={f.cliente_id} onChange={set('cliente_id')}>
            <option value="">— Prospect (new) —</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" value={f.fecha} onChange={set('fecha')} /></Field>
        <Field label="Plan">
          <select value={f.plan} onChange={set('plan')}>
            <option value="">Select plan...</option>
            {PLANES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={f.estado} onChange={set('estado')}>
            {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select value={f.prioridad} onChange={set('prioridad')}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </Field>
        <Field label="Proposal sent">
          <select value={f.propuesta_enviada ? 'yes' : 'no'} onChange={e => setF(p => ({ ...p, propuesta_enviada: e.target.value === 'yes' }))}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
        <Field label="Follow-up date"><input type="date" value={f.fecha_seguimiento} onChange={set('fecha_seguimiento')} /></Field>
        <Field label="Next action"><input value={f.proxima_accion} onChange={set('proxima_accion')} /></Field>
        <div style={{ gridColumn:'span 2' }}>
          <Field label="Notes"><textarea value={f.notas} onChange={set('notas')} rows={3} /></Field>
        </div>
      </div>
      {err && <div style={{ color:'var(--rojo-text)',fontSize:13,marginBottom:10 }}>{err}</div>}
      <div style={{ display:'flex',gap:10,justifyContent:'flex-end',marginTop:8 }}>
        <button type="button" onClick={onClose} style={{ padding:'9px 20px',borderRadius:8,border:'1px solid var(--linea)',background:'none',color:'var(--muted)',cursor:'pointer' }}>Cancel</button>
        <button type="submit" disabled={saving} style={{ padding:'9px 20px',borderRadius:8,border:'none',background:'var(--pulse)',color:'var(--petrol)',fontWeight:700,cursor:'pointer' }}>
          {saving ? 'Saving...' : 'Save Visit'}
        </button>
      </div>
    </form>
  );
}

export default function Visits() {
  const [visitas, setVisitas]         = useState<Visita[]>([]);
  const [clientes, setClientes]       = useState<Cliente[]>([]);
  const [filterEstado, setFilter]     = useState<'all' | VisitaEstado>('all');
  const [showModal, setShowModal]     = useState(false);
  const [editVisita, setEditVisita]   = useState<Visita | null>(null);
  const [converting, setConverting]   = useState<number | null>(null);
  const [loading, setLoading]         = useState(true);

  const load = () => Promise.all([
    apiFetch<Visita[]>('/ops/visitas'),
    apiFetch<Cliente[]>('/ops/clientes'),
  ]).then(([v, c]) => { setVisitas(v); setClientes(c); });

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function saveVisita(data: Partial<Visita>) {
    if (editVisita) {
      await apiFetch(`/ops/visitas/${editVisita.id}`, { method:'PUT', body:JSON.stringify(data) });
    } else {
      await apiFetch('/ops/visitas', { method:'POST', body:JSON.stringify(data) });
    }
    await load();
  }

  async function convertToClient(visita: Visita) {
    setConverting(visita.id);
    try {
      const cliente = await apiFetch<Cliente>('/ops/clientes', {
        method: 'POST',
        body: JSON.stringify({
          nombre: visita.venue,
          contacto: visita.contacto,
          vat_number: visita.vat_number,
          email: visita.email,
          telefono: visita.telefono,
          ciudad: visita.ciudad,
          direccion: visita.direccion,
          pais: 'Spain',
          tipo_cliente: 'b2b',
        }),
      });
      // Link client to visit
      await apiFetch(`/ops/visitas/${visita.id}`, {
        method: 'PUT',
        body: JSON.stringify({ cliente_id: cliente.id }),
      });
      await load();
      alert(`Client "${cliente.nombre}" created. Go to Invoices to create their first invoice.`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error converting to client');
    } finally {
      setConverting(null);
    }
  }

  const filtered = visitas.filter(v => filterEstado === 'all' || v.estado === filterEstado);

  if (loading) return <div style={{ color:'var(--muted)' }}>Loading...</div>;

  return (
    <div>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24 }}>
        <h1 style={{ fontFamily:'Syne, sans-serif',fontSize:26,fontWeight:800,color:'var(--ink)',margin:0 }}>
          Visits CRM <span style={{ fontSize:14,color:'var(--muted)',fontFamily:'DM Sans, sans-serif' }}>({visitas.length})</span>
        </h1>
        <div style={{ display:'flex',gap:10 }}>
          <button onClick={() => exportVisitasExcel(visitas)} style={{ display:'flex',alignItems:'center',gap:6,padding:'9px 16px',background:'var(--ivory-alt)',border:'none',borderRadius:8,color:'var(--ink)',cursor:'pointer',fontSize:13 }}>
            <Download size={14}/> Export
          </button>
          <button onClick={() => { setEditVisita(null); setShowModal(true); }} style={{ display:'flex',alignItems:'center',gap:6,padding:'9px 18px',background:'var(--pulse)',border:'none',borderRadius:8,color:'var(--petrol)',fontWeight:700,cursor:'pointer',fontSize:14 }}>
            <Plus size={16}/> New Visit
          </button>
        </div>
      </div>

      {/* Status filters */}
      <div style={{ display:'flex',gap:8,marginBottom:20,flexWrap:'wrap' }}>
        {(['all', ...ESTADOS] as ('all' | VisitaEstado)[]).map(e => (
          <button key={e} onClick={() => setFilter(e)} style={{
            padding:'5px 14px',borderRadius:20,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,
            background: filterEstado === e ? 'var(--pulse)' : 'var(--ivory-alt)',
            color: filterEstado === e ? 'var(--petrol)' : 'var(--muted)',
          }}>
            {e === 'all' ? 'All' : ESTADO_LABEL[e]}
            {e !== 'all' && (
              <span style={{ marginLeft:6,opacity:0.7 }}>
                ({visitas.filter(v => v.estado === e).length})
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
        {filtered.length === 0
          ? <div style={{ color:'var(--muted)',padding:20 }}>No visits found</div>
          : filtered.map(v => (
          <div key={v.id} style={{ background:'var(--ivory-alt)',borderRadius:12,border:'1px solid var(--linea)',padding:'16px 20px' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start' }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:4 }}>
                  <span style={{ fontWeight:700,fontSize:15,color:'var(--ink)' }}>{v.venue}</span>
                  <span style={{
                    background:`${ESTADO_COLOR[v.estado]}20`,color:ESTADO_COLOR[v.estado],
                    borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:600,
                  }}>{ESTADO_LABEL[v.estado]}</span>
                  <span style={{
                    background: v.prioridad==='high'?'rgba(229,72,77,0.1)':v.prioridad==='medium'?'rgba(255,122,26,0.1)':'rgba(15,46,56,0.1)',
                    color: v.prioridad==='high'?'var(--rojo-text)':v.prioridad==='medium'?'var(--naranja-text)':'var(--muted)',
                    borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:600,
                  }}>{v.prioridad}</span>
                </div>
                <div style={{ fontSize:12,color:'var(--muted)',display:'flex',gap:16,flexWrap:'wrap' }}>
                  {v.ciudad && <span>{v.ciudad}</span>}
                  {v.contacto && <span>{v.contacto}</span>}
                  {v.telefono && <span>{v.telefono}</span>}
                  {v.plan && <span style={{ color:'var(--muted)' }}>{v.plan}</span>}
                  <span>Visit: {formatDate(v.fecha)}</span>
                  {v.propuesta_enviada && <span style={{ color:'var(--verde-text)' }}>✓ Proposal sent</span>}
                  {v.fecha_seguimiento && <span>Follow-up: {formatDate(v.fecha_seguimiento)}</span>}
                </div>
                {v.proxima_accion && (
                  <div style={{ marginTop:6,fontSize:12,color:'var(--teal-tint)' }}>→ {v.proxima_accion}</div>
                )}
                {v.notas && (
                  <div style={{ marginTop:4,fontSize:12,color:'var(--muted)',fontStyle:'italic' }}>{v.notas}</div>
                )}
                {v.cliente_nombre && (
                  <div style={{ marginTop:6,fontSize:12,color:'var(--verde-text)' }}>Client: {v.cliente_nombre}</div>
                )}
              </div>
              <div style={{ display:'flex',gap:8,flexShrink:0,marginLeft:16 }}>
                {v.estado === 'closed' && !v.cliente_id && (
                  <button
                    onClick={() => convertToClient(v)}
                    disabled={converting === v.id}
                    style={{
                      display:'flex',alignItems:'center',gap:6,
                      padding:'7px 14px',borderRadius:8,border:'none',
                      background:'rgba(23,129,127,0.15)',color:'var(--verde-text)',
                      cursor:'pointer',fontSize:12,fontWeight:700,
                    }}
                  >
                    <UserCheck size={14}/>
                    {converting === v.id ? 'Converting...' : 'Convert to Client'}
                  </button>
                )}
                <button
                  onClick={() => { setEditVisita(v); setShowModal(true); }}
                  style={{ padding:'7px 14px',borderRadius:8,border:'1px solid var(--linea)',background:'none',color:'var(--muted)',cursor:'pointer',fontSize:12 }}
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <Modal title={editVisita ? 'Edit Visit' : 'New Visit'} onClose={() => setShowModal(false)}>
          <VisitaForm initial={editVisita || undefined} clientes={clientes} onSave={saveVisita} onClose={() => setShowModal(false)} />
        </Modal>
      )}
    </div>
  );
}
