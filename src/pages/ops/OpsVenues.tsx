import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/opsFetch';
import { useLang } from '../../context/LangContext';
import { MapPin, Phone, Globe, Search, Filter } from 'lucide-react';

const LOCALE_MAP: Record<string, string> = { es: 'es-ES', en: 'en-GB', fi: 'fi-FI', et: 'et-EE', sv: 'sv-SE' };

type Zone = { id: string; name: string; venue_count: number };
type Venue = {
  id: string;
  name: string;
  category: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  lat: number | null;
  lng: number | null;
  plan_type: string;
  is_verified: boolean;
  claimed: boolean;
  zone_name: string;
};
type ListResp = { venues: Venue[]; total: number; limit: number; offset: number };

const CATEGORIES = ['bar', 'hotel', 'restaurant', 'nightclub', 'beach_club', 'wellness', 'other'];
const PAGE_SIZE = 50;

export default function OpsVenues() {
  const { lang, t } = useLang();
  const [zones, setZones] = useState<Zone[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [zoneId, setZoneId] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [unclaimed, setUnclaimed] = useState(false);
  const [unvisited, setUnvisited] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    apiFetch<Zone[]>('/ops/venues/zones').then(setZones).catch(e => setErr(String(e)));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (zoneId) params.set('zone_id', zoneId);
    if (category) params.set('category', category);
    if (search) params.set('search', search);
    if (unclaimed) params.set('unclaimed', 'true');
    if (unvisited) params.set('unvisited', 'true');
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));

    apiFetch<ListResp>(`/ops/venues?${params}`)
      .then(r => { setVenues(r.venues); setTotal(r.total); })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [zoneId, category, search, unclaimed, unvisited, page]);

  useEffect(() => { setPage(0); }, [zoneId, category, search, unclaimed, unvisited]);

  const locale = LOCALE_MAP[lang] || 'es-ES';
  const L = {
    title:         t('venues.title'),
    subtitle:      `${total.toLocaleString(locale)} ${t('venues.subtitle')}`,
    allZones:      t('filter.allZones'),
    allCategories: t('venues.allCategories'),
    searchPh:      t('venues.searchPh'),
    unclaimed:     t('venues.unclaimed'),
    unvisited:     t('venues.unvisited'),
    name:          t('label.name'),
    category:      t('venues.category'),
    zone:          t('label.zone'),
    contact:       t('label.contact'),
    status:        t('label.status'),
    prev:          t('venues.prev'),
    next:          t('venues.next'),
    page:          t('venues.page'),
    of:            t('venues.of'),
    premium:       t('venues.premium'),
    claimed:       t('venues.claimed'),
    cold:          t('venues.cold'),
    loading:       t('common.loading'),
    empty:         t('venues.empty'),
  };

  const pages = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--ink)' }}>{L.title}</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 14 }}>{L.subtitle}</p>
      </div>

      {/* Filtros */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12, marginBottom: 16, padding: 16, background: 'var(--ivory-alt)',
        borderRadius: 12, border: '1px solid var(--linea, #D9D5CC)',
      }}>
        <div style={{ position: 'relative', gridColumn: 'span 2' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={L.searchPh}
            style={inputStyle(true)}
          />
        </div>
        <select value={zoneId} onChange={e => setZoneId(e.target.value)} style={inputStyle(false)}>
          <option value="">{L.allZones}</option>
          {zones.map(z => (
            <option key={z.id} value={z.id}>{z.name} ({z.venue_count})</option>
          ))}
        </select>
        <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle(false)}>
          <option value="">{L.allCategories}</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={toggleStyle(unclaimed)}>
          <input type="checkbox" checked={unclaimed} onChange={e => setUnclaimed(e.target.checked)} style={{ marginRight: 8 }} />
          <Filter size={14} style={{ marginRight: 6 }} />
          {L.unclaimed}
        </label>
        <label style={toggleStyle(unvisited)}>
          <input type="checkbox" checked={unvisited} onChange={e => setUnvisited(e.target.checked)} style={{ marginRight: 8 }} />
          <Filter size={14} style={{ marginRight: 6 }} />
          {L.unvisited}
        </label>
      </div>

      {err && <div style={{
        background: '#FDECEC', color: '#B02020', padding: 12, borderRadius: 8, marginBottom: 16,
      }}>{err}</div>}

      {/* Tabla */}
      <div style={{
        background: 'var(--ivory-alt)', borderRadius: 12,
        border: '1px solid var(--linea, #D9D5CC)', overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>{L.loading}</div>
        ) : venues.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>{L.empty}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--ivory)', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={thStyle}>{L.name}</th>
                  <th style={thStyle}>{L.category}</th>
                  <th style={thStyle}>{L.zone}</th>
                  <th style={thStyle}>{L.contact}</th>
                  <th style={thStyle}>{L.status}</th>
                </tr>
              </thead>
              <tbody>
                {venues.map(v => (
                  <tr key={v.id} style={{ borderTop: '1px solid var(--linea, #D9D5CC)' }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{v.name}</div>
                      {v.address && (
                        <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <MapPin size={11} /> {v.address}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '2px 8px', background: 'var(--ivory)',
                        border: '1px solid var(--linea, #D9D5CC)', borderRadius: 4,
                        fontSize: 11, textTransform: 'capitalize', color: 'var(--ink)',
                      }}>{v.category}</span>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--ink)' }}>{v.zone_name}</td>
                    <td style={tdStyle}>
                      {v.phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--ink)', fontSize: 12 }}>
                          <Phone size={11} color="var(--muted)" /> {v.phone}
                        </div>
                      )}
                      {v.website && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Globe size={11} color="var(--muted)" />
                          <a href={v.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal-accent)', fontSize: 11 }}>
                            {v.website.replace(/^https?:\/\//, '').split('/')[0]}
                          </a>
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {v.plan_type !== 'none' ? (
                        <span style={badge('var(--pulse)', 'var(--pulse-soft)')}>{L.premium}</span>
                      ) : v.claimed ? (
                        <span style={badge('var(--teal-accent)', 'rgba(23,129,127,0.10)')}>{L.claimed}</span>
                      ) : (
                        <span style={badge('var(--muted)', 'rgba(94,109,114,0.10)')}>{L.cold}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginación */}
      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={pageBtn(page === 0)}
          >{L.prev}</button>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>
            {L.page} {page + 1} {L.of} {pages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
            disabled={page >= pages - 1}
            style={pageBtn(page >= pages - 1)}
          >{L.next}</button>
        </div>
      )}
    </div>
  );
}

const inputStyle = (withPad: boolean): React.CSSProperties => ({
  width: '100%',
  padding: withPad ? '10px 12px 10px 36px' : '10px 12px',
  background: 'var(--ivory)',
  border: '1px solid var(--linea, #D9D5CC)',
  borderRadius: 8,
  color: 'var(--ink)',
  fontSize: 14,
  fontFamily: 'var(--font-body)',
});
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '12px 16px', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'top' };
const toggleStyle = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', padding: '8px 14px',
  background: active ? 'var(--pulse-soft)' : 'var(--ivory-alt)',
  border: `1px solid ${active ? 'var(--pulse)' : 'var(--linea, #D9D5CC)'}`,
  borderRadius: 8, color: active ? 'var(--pulse-deep)' : 'var(--muted)',
  fontSize: 13, cursor: 'pointer', userSelect: 'none',
});
const badge = (color: string, bg: string): React.CSSProperties => ({
  padding: '2px 8px', background: bg, color, borderRadius: 4, fontSize: 11, fontWeight: 600,
});
const pageBtn = (disabled: boolean): React.CSSProperties => ({
  padding: '6px 14px', background: disabled ? 'var(--ivory)' : 'var(--ivory-alt)',
  border: '1px solid var(--linea, #D9D5CC)', borderRadius: 6,
  color: disabled ? 'var(--silver)' : 'var(--ink)', fontSize: 13,
  cursor: disabled ? 'not-allowed' : 'pointer',
});
