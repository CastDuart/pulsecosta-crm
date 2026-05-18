import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/opsFetch';
import type { Cliente, Factura, Visita } from '../../types';
import { formatEur, formatDate } from '../../lib/iva';
import { Plus, X, ChevronDown, ChevronUp, FileText } from 'lucide-react';

const PAISES = ['Estonia','Spain','Finland','Germany','France','Netherlands','Sweden','Portugal','Italy','Belgium','Austria','Other'];

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#112240', borderRadius: 16, padding: 32,
        width: '100%', maxWidth: 560, border: '1px solid #1a2f50',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#E8F0FE' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8892B0', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 12, color: '#8892B0', display: 'block', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function ClientForm({
  initial, onSave, onClose,
}: {
  initial?: Partial<Cliente>;
  onSave: (data: Partial<Cliente>) => Promise<void>;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    nombre: initial?.nombre || '',
    contacto: initial?.contacto || '',
    vat_number: initial?.vat_number || '',
    tipo_cliente: initial?.tipo_cliente || 'b2b',
    pais: initial?.pais || 'Estonia',
    email: initial?.email || '',
    telefono: initial?.telefono || '',
    direccion: initial?.direccion || '',
    codigo_postal: initial?.codigo_postal || '',
    ciudad: initial?.ciudad || '',
    notas: initial?.notas || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr('');
    try { await onSave(f); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: 'span 2' }}>
          <Field label="Company / Name *"><input value={f.nombre} onChange={set('nombre')} required /></Field>
        </div>
        <Field label="Contact person"><input value={f.contacto} onChange={set('contacto')} /></Field>
        <Field label="VAT Number">
          <input value={f.vat_number} onChange={set('vat_number')} placeholder="EE123456789" />
        </Field>
        <Field label="Email"><input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Phone"><input value={f.telefono} onChange={set('telefono')} /></Field>
        <div style={{ gridColumn: 'span 2' }}>
          <Field label="Street address">
            <input value={f.direccion} onChange={set('direccion')} placeholder="Street and number" />
          </Field>
        </div>
        <Field label="Postal code"><input value={f.codigo_postal} onChange={set('codigo_postal')} /></Field>
        <Field label="City"><input value={f.ciudad} onChange={set('ciudad')} /></Field>
        <Field label="Country">
          <select value={f.pais} onChange={set('pais')}>
            {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select value={f.tipo_cliente} onChange={set('tipo_cliente')}>
            <option value="b2b">B2B</option>
            <option value="b2c">B2C</option>
          </select>
        </Field>
        <div style={{ gridColumn: 'span 2' }}>
          <Field label="Notes"><textarea value={f.notas} onChange={set('notas')} rows={3} /></Field>
        </div>
      </div>
      {err && <div style={{ color: '#FF4757', fontSize: 13, marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" onClick={onClose} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid #1a2f50', background: 'none', color: '#8892B0', cursor: 'pointer' }}>Cancel</button>
        <button type="submit" disabled={saving} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#FF8C00', color: '#0A192F', fontWeight: 700, cursor: 'pointer' }}>
          {saving ? 'Saving...' : 'Save Client'}
        </button>
      </div>
    </form>
  );
}

function ClientCard({ cliente, facturas, visitas, onEdit }: {
  cliente: Cliente; facturas: Factura[]; visitas: Visita[]; onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const clientFacturas = facturas.filter(f => f.cliente_id === cliente.id);
  const clientVisitas  = visitas.filter(v => v.cliente_id === cliente.id);
  const openBalance = clientFacturas
    .filter(f => ['sent','overdue'].includes(f.estado))
    .reduce((s, f) => s + f.total, 0);

  return (
    <div style={{ background: '#112240', borderRadius: 12, border: '1px solid #1a2f50', overflow: 'hidden', marginBottom: 8 }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '14px 20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 600, color: '#E8F0FE', fontSize: 15 }}>{cliente.nombre}</div>
            <div style={{ fontSize: 12, color: '#8892B0', marginTop: 2 }}>
              {cliente.pais} {cliente.vat_number ? `· ${cliente.vat_number}` : ''}
              {cliente.ciudad ? ` · ${cliente.ciudad}` : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {openBalance > 0 && (
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#FF8C00', fontWeight: 700 }}>
              Open: {formatEur(openBalance)}
            </span>
          )}
          <span style={{ fontSize: 11, color: '#8892B0' }}>
            <FileText size={12} style={{ display: 'inline', marginRight: 4 }} />
            {clientFacturas.length}
          </span>
          <button onClick={e => { e.stopPropagation(); onEdit(); }} style={{ background: 'none', border: '1px solid #1a2f50', borderRadius: 6, padding: '4px 10px', color: '#8892B0', cursor: 'pointer', fontSize: 12 }}>Edit</button>
          {expanded ? <ChevronUp size={16} color="#8892B0" /> : <ChevronDown size={16} color="#8892B0" />}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid #1a2f50', padding: '16px 20px', background: '#0A192F' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Invoice history */}
            <div>
              <div style={{ fontSize: 12, color: '#8892B0', fontWeight: 600, marginBottom: 8 }}>Invoice History</div>
              {clientFacturas.length === 0
                ? <div style={{ fontSize: 12, color: '#8892B0' }}>No invoices</div>
                : clientFacturas.slice(0, 5).map(f => (
                  <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, borderBottom: '1px solid #1a2f50' }}>
                    <span style={{ color: '#FF8C00', fontFamily: 'JetBrains Mono, monospace' }}>{f.numero}</span>
                    <span style={{ color: '#E8F0FE' }}>{formatEur(f.total)}</span>
                    <span style={{ color: f.estado === 'collected' ? '#43E97B' : f.estado === 'overdue' ? '#FF4757' : '#8892B0' }}>{f.estado}</span>
                  </div>
                ))
              }
            </div>
            {/* Visit history */}
            <div>
              <div style={{ fontSize: 12, color: '#8892B0', fontWeight: 600, marginBottom: 8 }}>Visit History</div>
              {clientVisitas.length === 0
                ? <div style={{ fontSize: 12, color: '#8892B0' }}>No visits</div>
                : clientVisitas.slice(0, 5).map(v => (
                  <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, borderBottom: '1px solid #1a2f50' }}>
                    <span style={{ color: '#E8F0FE' }}>{formatDate(v.fecha)}</span>
                    <span style={{ color: '#8892B0' }}>{v.venue}</span>
                    <span style={{ color: v.estado === 'closed' ? '#43E97B' : '#38BDF8' }}>{v.estado}</span>
                  </div>
                ))
              }
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
            {cliente.email && (
              <a href={`mailto:${cliente.email}`} style={{ fontSize: 12, color: '#38BDF8', textDecoration: 'none' }}>{cliente.email}</a>
            )}
            {cliente.telefono && (
              <span style={{ fontSize: 12, color: '#8892B0' }}>{cliente.telefono}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Clients() {
  const [clientes, setClientes]     = useState<Cliente[]>([]);
  const [facturas, setFacturas]     = useState<Factura[]>([]);
  const [visitas, setVisitas]       = useState<Visita[]>([]);
  const [search, setSearch]         = useState('');
  const [showModal, setShowModal]   = useState(false);
  const [editClient, setEditClient] = useState<Cliente | null>(null);
  const [loading, setLoading]       = useState(true);

  const load = () => Promise.all([
    apiFetch<Cliente[]>('/ops/clientes'),
    apiFetch<Factura[]>('/ops/facturas'),
    apiFetch<Visita[]>('/ops/visitas'),
  ]).then(([c, f, v]) => { setClientes(c); setFacturas(f); setVisitas(v); });

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function saveClient(data: Partial<Cliente>) {
    if (editClient) {
      await apiFetch(`/ops/clientes/${editClient.id}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      await apiFetch('/ops/clientes', { method: 'POST', body: JSON.stringify(data) });
    }
    await load();
  }

  const filtered = clientes.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    c.ciudad?.toLowerCase().includes(search.toLowerCase()) ||
    c.vat_number?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div style={{ color: '#8892B0' }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 800, color: '#E8F0FE', margin: 0 }}>
          Clients <span style={{ fontSize: 14, color: '#8892B0', fontFamily: 'DM Sans, sans-serif' }}>({clientes.length})</span>
        </h1>
        <button onClick={() => { setEditClient(null); setShowModal(true); }} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px',
          background: '#FF8C00', border: 'none', borderRadius: 8,
          color: '#0A192F', fontWeight: 700, cursor: 'pointer', fontSize: 14,
        }}>
          <Plus size={16} /> New Client
        </button>
      </div>

      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by name, city or VAT..."
        style={{ marginBottom: 16, maxWidth: 360 }}
      />

      <div>
        {filtered.length === 0
          ? <div style={{ color: '#8892B0', padding: 20 }}>No clients found</div>
          : filtered.map(c => (
            <ClientCard
              key={c.id} cliente={c} facturas={facturas} visitas={visitas}
              onEdit={() => { setEditClient(c); setShowModal(true); }}
            />
          ))
        }
      </div>

      {showModal && (
        <Modal title={editClient ? 'Edit Client' : 'New Client'} onClose={() => setShowModal(false)}>
          <ClientForm initial={editClient || undefined} onSave={saveClient} onClose={() => setShowModal(false)} />
        </Modal>
      )}
    </div>
  );
}
