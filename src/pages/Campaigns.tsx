import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Mail, MessageCircle, Search, Send, Users } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { apiFetch as opsFetch } from '../lib/opsFetch';
import type { Account, Lead } from '../types';

type Channel = 'email' | 'whatsapp';
type Audience = 'venues' | 'leads' | 'accounts' | 'manual';

type Venue = {
  id: string;
  name: string;
  category: string | null;
  zone_name: string | null;
  phone: string | null;
  email: string | null;
};

type VenueResp = { venues: Venue[]; total: number };

type Recipient = {
  id: string;
  name: string;
  source: string;
  category?: string | null;
  zone?: string | null;
  email?: string | null;
  phone?: string | null;
};

const TEMPLATES: Record<Channel, { subject: string; body: string }> = {
  email: {
    subject: 'PulseCosta: activamos visibilidad local en la Costa del Sol',
    body:
      'Hola {nombre},\n\nSoy Cipriano de PulseCosta. Estamos preparando la campaña local para dar más visibilidad a negocios de la Costa del Sol con horarios, fotos y contacto actualizado.\n\n¿Te viene bien que revisemos vuestra ficha y la dejemos lista esta semana?\n\nGracias,\nPulseCosta',
  },
  whatsapp: {
    subject: '',
    body:
      'Hola {nombre}, soy Cipriano de PulseCosta. Estamos actualizando fichas de negocios de la Costa del Sol para mejorar visibilidad, horarios y fotos. ¿Te viene bien que revisemos la vuestra esta semana?',
  },
};
const LIST_STEP = 250;
const CATEGORY_LABEL: Record<string, string> = {
  bar: 'Bar',
  hotel: 'Hotel',
  restaurant: 'Restaurante',
  nightclub: 'Discoteca',
  beach_club: 'Beach club',
  wellness: 'Bienestar',
  other: 'Otro',
};

async function loadAllVenues() {
  const limit = 500;
  let offset = 0;
  const all: Venue[] = [];

  while (true) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    const page = await opsFetch<VenueResp>(`/ops/venues?${params}`);
    all.push(...(page.venues || []));
    const total = page.total || all.length;
    if (all.length >= total) break;
    offset += limit;
  }

  return all;
}

function cleanPhone(phone?: string | null) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.length === 9) return `34${digits}`;
  return digits;
}

function fillTemplate(text: string, r?: Recipient) {
  if (!r) return text;
  return text.replaceAll('{nombre}', r.name);
}

function copyText(text: string) {
  return navigator.clipboard?.writeText(text).catch(() => undefined);
}

export default function Campaigns() {
  const [audience, setAudience] = useState<Audience>('venues');
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [manual, setManual] = useState<Recipient[]>([]);
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [listLimit, setListLimit] = useState(LIST_STEP);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState(TEMPLATES.whatsapp.subject);
  const [body, setBody] = useState(TEMPLATES.whatsapp.body);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch<Lead[]>('/crm/leads'),
      apiFetch<Account[]>('/crm/accounts'),
      loadAllVenues(),
    ])
      .then(([leadRows, accountRows, venueRows]) => {
        if (!alive) return;
        setLeads(leadRows);
        setAccounts(accountRows);
        setVenues(venueRows);
      })
      .catch(e => setStatus(e instanceof Error ? e.message : 'No se pudieron cargar los contactos'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const recipients = useMemo<Recipient[]>(() => {
    if (audience === 'accounts') {
      return accounts.map(a => ({
        id: `account-${a.id}`,
        name: a.name,
        source: `Cuenta · ${a.plan}`,
        zone: a.zone,
        email: a.contact_email,
        phone: a.contact_phone,
      }));
    }
    if (audience === 'venues') {
      return venues.map(v => ({
        id: `venue-${v.id}`,
        name: v.name,
        source: `Local · ${CATEGORY_LABEL[v.category || ''] || 'Sin categoría'}`,
        category: v.category,
        zone: v.zone_name,
        email: v.email,
        phone: v.phone,
      }));
    }
    if (audience === 'manual') return manual;
    return leads.map(l => ({
      id: `lead-${l.id}`,
      name: l.name,
      source: `Lead · ${l.stage}`,
      zone: l.zone,
      email: l.email,
      phone: l.phone,
    }));
  }, [accounts, audience, leads, manual, venues]);

  const zones = useMemo(() => [...new Set(venues.map(v => v.zone_name).filter((v): v is string => Boolean(v)))].sort(), [venues]);
  const categories = useMemo(() => [...new Set(venues.map(v => v.category).filter((v): v is string => Boolean(v)))].sort(), [venues]);
  const eligible = recipients.filter(r => (channel === 'email' ? r.email : cleanPhone(r.phone)));
  const visible = eligible.filter(r => {
    if (audience === 'venues' && zoneFilter && r.zone !== zoneFilter) return false;
    if (audience === 'venues' && categoryFilter && r.category !== categoryFilter) return false;
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [r.name, r.zone, r.source, r.email, r.phone].some(v => (v || '').toLowerCase().includes(needle));
  });
  const selected = visible.filter(r => selectedIds.has(r.id));
  const displayed = visible.slice(0, listLimit);
  const selectedDisplayed = displayed.filter(r => selectedIds.has(r.id));
  const allDisplayedSelected = displayed.length > 0 && selectedDisplayed.length === displayed.length;
  const allVisibleSelected = visible.length > 0 && selected.length === visible.length;
  const preview = fillTemplate(body, selected[0] || visible[0]);

  const toggleDisplayed = () => {
    if (allDisplayedSelected) {
      const next = new Set(selectedIds);
      displayed.forEach(r => next.delete(r.id));
      setSelectedIds(next);
      return;
    }
    setSelectedIds(new Set([...selectedIds, ...displayed.map(r => r.id)]));
  };

  const toggleVisible = () => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(visible.map(r => r.id)));
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const emailHref = (r: Recipient) => {
    const params = new URLSearchParams({
      subject,
      body: fillTemplate(body, r),
    });
    return `mailto:${r.email}?${params.toString()}`;
  };

  const whatsappHref = (r: Recipient) => {
    const params = new URLSearchParams({ text: fillTemplate(body, r) });
    return `https://wa.me/${cleanPhone(r.phone)}?${params.toString()}`;
  };

  const exportCsv = () => {
    const rows = selected.length ? selected : visible;
    const csv = [
      ['nombre', 'origen', 'zona', 'email', 'telefono'],
      ...rows.map(r => [r.name, r.source, r.zone || '', r.email || '', r.phone || '']),
    ]
      .map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    copyText(csv);
    setStatus(`${rows.length} contactos copiados como CSV`);
  };

  const changeAudience = (next: Audience) => {
    setAudience(next);
    setListLimit(LIST_STEP);
    setZoneFilter('');
    setCategoryFilter('');
    setSelectedIds(new Set());
  };

  const changeChannel = (next: Channel) => {
    setChannel(next);
    setSubject(TEMPLATES[next].subject);
    setBody(TEMPLATES[next].body);
    setListLimit(LIST_STEP);
    setSelectedIds(new Set());
  };

  const changeSearch = (next: string) => {
    setSearch(next);
    setListLimit(LIST_STEP);
  };

  const changeZone = (next: string) => {
    setZoneFilter(next);
    setListLimit(LIST_STEP);
    setSelectedIds(new Set());
  };

  const changeCategory = (next: string) => {
    setCategoryFilter(next);
    setListLimit(LIST_STEP);
    setSelectedIds(new Set());
  };

  const addManualRecipient = () => {
    const name = manualName.trim();
    const email = manualEmail.trim();
    const phone = manualPhone.trim();
    if (!name || (!email && !phone)) {
      setStatus('Añade nombre y al menos email o teléfono');
      return;
    }
    const id = `manual-${Date.now()}`;
    const next = { id, name, source: 'Manual', email, phone };
    setManual(prev => [next, ...prev]);
    setAudience('manual');
    setSelectedIds(new Set([id]));
    setManualName('');
    setManualEmail('');
    setManualPhone('');
    setStatus(`${name} añadido manualmente`);
  };

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Campañas</span>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={exportCsv}>
            <Copy size={15} /> Copiar CSV
          </button>
        </div>
      </div>

      <div className="page-content campaigns-page">
        <section className="campaigns-toolbar">
          <div className="campaign-control">
            <span>Audiencia</span>
            <div className="segmented-control" role="group" aria-label="Audiencia">
              <button className={audience === 'leads' ? 'active' : ''} onClick={() => changeAudience('leads')}>Leads</button>
              <button className={audience === 'accounts' ? 'active' : ''} onClick={() => changeAudience('accounts')}>Cuentas</button>
              <button className={audience === 'venues' ? 'active' : ''} onClick={() => changeAudience('venues')}>Locales</button>
              <button className={audience === 'manual' ? 'active' : ''} onClick={() => changeAudience('manual')}>Manual</button>
            </div>
          </div>

          <div className="campaign-control">
            <span>Canal</span>
            <div className="segmented-control" role="group" aria-label="Canal">
              <button className={channel === 'whatsapp' ? 'active' : ''} onClick={() => changeChannel('whatsapp')}>
                <MessageCircle size={15} /> WhatsApp
              </button>
              <button className={channel === 'email' ? 'active' : ''} onClick={() => changeChannel('email')}>
                <Mail size={15} /> Email
              </button>
            </div>
          </div>

          <div className="campaign-stats">
            <Users size={18} />
            <strong>{loading ? '...' : visible.length}</strong>
            <span>{loading ? 'cargando contactos' : `${selected.length} seleccionados · ${channel === 'email' ? 'email' : 'teléfono'}`}</span>
          </div>
        </section>

        {audience === 'venues' && (
          <section className="campaign-filters">
            <select value={zoneFilter} onChange={e => changeZone(e.target.value)}>
              <option value="">Todas las zonas</option>
              {zones.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
            <select value={categoryFilter} onChange={e => changeCategory(e.target.value)}>
              <option value="">Todas las categorías</option>
              {categories.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c] || c}</option>)}
            </select>
          </section>
        )}

        <section className="manual-recipient">
          <div>
            <strong>Añadir contacto manual</strong>
            <span>Para un local que falte o una prueba puntual.</span>
          </div>
          <input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Nombre del local" />
          <input value={manualPhone} onChange={e => setManualPhone(e.target.value)} placeholder="Teléfono" />
          <input value={manualEmail} onChange={e => setManualEmail(e.target.value)} placeholder="Email" />
          <button className="btn btn-primary" onClick={addManualRecipient}>Añadir</button>
        </section>

        <section className="campaigns-grid">
          <div className="campaign-panel">
            <div className="campaign-panel-head">
              <h2>Mensaje</h2>
              <button className="btn btn-ghost" onClick={() => { copyText(preview); setStatus('Mensaje copiado'); }}>
                <Copy size={15} /> Copiar
              </button>
            </div>

            {channel === 'email' && (
              <label className="form-field">
                <span className="form-label">Asunto</span>
                <input className="form-input" value={subject} onChange={e => setSubject(e.target.value)} />
              </label>
            )}

            <label className="form-field">
              <span className="form-label">Texto</span>
              <textarea
                className="form-input campaign-textarea"
                value={body}
                onChange={e => setBody(e.target.value)}
              />
            </label>

            <div className="campaign-preview">
              <span>Vista previa</span>
              <p>{preview}</p>
            </div>
          </div>

          <div className="campaign-panel">
            <div className="campaign-panel-head">
              <div>
                <h2>Destinatarios</h2>
                <span className="campaign-panel-subtitle">
                  Mostrando {displayed.length} de {visible.length}
                </span>
              </div>
              <div className="campaign-selection-actions">
                <button className="btn btn-ghost" onClick={toggleDisplayed} disabled={!displayed.length}>
                  {allDisplayedSelected ? 'Quitar mostrados' : 'Seleccionar mostrados'}
                </button>
                <button className="btn btn-ghost" onClick={toggleVisible} disabled={!visible.length}>
                  {allVisibleSelected ? 'Limpiar todo' : 'Seleccionar filtrados'}
                </button>
              </div>
            </div>

            <div className="campaign-search">
              <Search size={16} />
              <input value={search} onChange={e => changeSearch(e.target.value)} placeholder="Buscar por nombre, zona o contacto" />
            </div>

            {status && <div className="campaign-status">{status}</div>}
            {loading && <div className="campaign-empty">Cargando contactos...</div>}
            {!loading && !visible.length && <div className="campaign-empty">No hay contactos disponibles para este canal.</div>}

            <div className="recipient-list">
              {displayed.map(r => (
                <article className="recipient-row" key={r.id}>
                  <label>
                    <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleOne(r.id)} />
                    <span>
                      <strong>{r.name}</strong>
                      <small>{r.source}{r.zone ? ` · ${r.zone}` : ''}</small>
                    </span>
                  </label>
                  <a
                    className="icon-action"
                    href={channel === 'email' ? emailHref(r) : whatsappHref(r)}
                    target={channel === 'email' ? undefined : '_blank'}
                    rel={channel === 'email' ? undefined : 'noopener noreferrer'}
                    title={channel === 'email' ? 'Abrir email' : 'Abrir WhatsApp'}
                  >
                    {channel === 'email' ? <Mail size={16} /> : <Send size={16} />}
                    <ExternalLink size={13} />
                  </a>
                </article>
              ))}
            </div>
            {visible.length > displayed.length && (
              <button className="btn btn-ghost campaign-more" onClick={() => setListLimit(v => v + LIST_STEP)}>
                Mostrar {Math.min(LIST_STEP, visible.length - displayed.length)} más de {visible.length}
              </button>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
