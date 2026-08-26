import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/opsFetch';
import type { Cliente, Factura, Visita } from '../../types';
import { formatEur, formatDate } from '../../lib/iva';
import { Plus, X, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import ChipSelect from '../../components/ui/ChipSelect';

const PAISES = ['Estonia','Spain','Finland','Germany','France','Netherlands','Sweden','Portugal','Italy','Belgium','Austria','Other'];

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: 'var(--ivory-alt)', borderRadius: 16, padding: 32,
        width: '100%', maxWidth: 560, border: '1px solid var(--linea)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
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
      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>{label}</label>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div style={{ gridColumn: 'span 2' }}>
          <Field label="Empresa / Nombre *"><input className="form-input" value={f.nombre} onChange={set('nombre')} required /></Field>
        </div>
        <Field label="Persona de contacto"><input className="form-input" value={f.contacto} onChange={set('contacto')} /></Field>
        <Field label="NIF / VAT">
          <input className="form-input" value={f.vat_number} onChange={set('vat_number')} placeholder="ESB12345678" />
        </Field>
        <Field label="Email"><input className="form-input" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Teléfono"><input className="form-input" value={f.telefono} onChange={set('telefono')} /></Field>
        <div style={{ gridColumn: 'span 2' }}>
          <Field label="Dirección">
            <input className="form-input" value={f.direccion} onChange={set('direccion')} placeholder="Calle y número" />
          </Field>
        </div>
        <Field label="Código postal"><input className="form-input" value={f.codigo_postal} onChange={set('codigo_postal')} /></Field>
        <Field label="Ciudad"><input className="form-input" value={f.ciudad} onChange={set('ciudad')} /></Field>
        <Field label="País">
          <ChipSelect
            value={f.pais}
            onChange={v => setF(p => ({ ...p, pais: v }))}
            options={PAISES.map(p => ({ value: p, label: p }))}
          />
        </Field>
        <Field label="Tipo">
          <ChipSelect
            value={f.tipo_cliente}
            onChange={v => setF(p => ({ ...p, tipo_cliente: v as 'b2b' | 'b2c' }))}
            options={[{ value: 'b2b', label: 'B2B' }, { value: 'b2c', label: 'B2C' }]}
          />
        </Field>
        <div style={{ gridColumn: 'span 2' }}>
          <Field label="Notas"><textarea className="form-input" value={f.notas} onChange={set('notas')} rows={3} style={{ resize: 'vertical' }} /></Field>
        </div>
      </div>
      {err && <div style={{ color: 'var(--rojo-text)', fontSize: 13, marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" onClick={onClose} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--linea)', background: 'none', color: 'var(--muted)', cursor: 'pointer' }}>Cancelar</button>
        <button type="submit" disabled={saving} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: 'var(--pulse)', color: 'var(--petrol)', fontWeight: 700, cursor: 'pointer' }}>
          {saving ? 'Guardando...' : 'Guardar cliente'}
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
    <div style={{ background: 'var(--ivory-alt)', borderRadius: 12, border: '1px solid var(--linea)', overflow: 'hidden', marginBottom: 8 }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '14px 20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 15 }}>{cliente.nombre}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {cliente.pais} {cliente.vat_number ? `· ${cliente.vat_number}` : ''}
              {cliente.ciudad ? ` · ${cliente.ciudad}` : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {openBalance > 0 && (
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--naranja-text)', fontWeight: 700 }}>
              Open: {formatEur(openBalance)}
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            <FileText size={12} style={{ display: 'inline', marginRight: 4 }} />
            {clientFacturas.length}
          </span>
          <button onClick={e => { e.stopPropagation(); onEdit(); }} style={{ background: 'none', border: '1px solid var(--linea)', borderRadius: 6, padding: '4px 10px', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>Edit</button>
          {expanded ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--linea)', padding: '16px 20px', background: 'var(--ivory)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {/* Invoice history */}
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 8 }}>Invoice History</div>
              {clientFacturas.length === 0
                ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>No invoices</div>
                : clientFacturas.slice(0, 5).map(f => (
                  <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, borderBottom: '1px solid var(--linea)' }}>
                    <span style={{ color: 'var(--naranja-text)', fontFamily: 'JetBrains Mono, monospace' }}>{f.numero}</span>
                    <span style={{ color: 'var(--ink)' }}>{formatEur(f.total)}</span>
                    <span style={{ color: f.estado === 'collected' ? 'var(--verde-text)' : f.estado === 'overdue' ? 'var(--rojo-text)' : 'var(--muted)' }}>{f.estado}</span>
                  </div>
                ))
              }
            </div>
            {/* Visit history */}
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 8 }}>Visit History</div>
              {clientVisitas.length === 0
                ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>No visits</div>
                : clientVisitas.slice(0, 5).map(v => (
                  <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, borderBottom: '1px solid var(--linea)' }}>
                    <span style={{ color: 'var(--ink)' }}>{formatDate(v.fecha)}</span>
                    <span style={{ color: 'var(--muted)' }}>{v.venue}</span>
                    <span style={{ color: v.estado === 'closed' ? 'var(--verde-text)' : 'var(--teal-accent)' }}>{v.estado}</span>
                  </div>
                ))
              }
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
            {cliente.email && (
              <a href={`mailto:${cliente.email}`} style={{ fontSize: 12, color: 'var(--teal-tint)', textDecoration: 'none' }}>{cliente.email}</a>
            )}
            {cliente.telefono && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{cliente.telefono}</span>
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

  if (loading) return <div style={{ color: 'var(--muted)' }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>
          Clients <span style={{ fontSize: 14, color: 'var(--muted)', fontFamily: 'DM Sans, sans-serif' }}>({clientes.length})</span>
        </h1>
        <button onClick={() => { setEditClient(null); setShowModal(true); }} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px',
          background: 'var(--pulse)', border: 'none', borderRadius: 8,
          color: 'var(--petrol)', fontWeight: 700, cursor: 'pointer', fontSize: 14,
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
          ? <div style={{ color: 'var(--muted)', padding: 20 }}>No clients found</div>
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
