import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../lib/opsFetch';
import type { Factura, CajaMovimiento, TimeFilter } from '../../types';
import { formatEur, formatDate, isOverdue, daysOverdue } from '../../lib/iva';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LangContext';
import { AlertTriangle, TrendingUp, Clock, Wallet, BarChart3, Trash2 } from 'lucide-react';

type QFilter = 'all' | 'Q1' | 'Q2' | 'Q3' | 'Q4';

function filterByTime<T extends { fecha_emision?: string; fecha?: string }>(
  items: T[], filter: TimeFilter
): T[] {
  const now = new Date();
  return items.filter(item => {
    const d = new Date((item.fecha_emision || item.fecha) as string);
    if (filter === 'this_month')
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (filter === 'last_month') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear();
    }
    if (filter === 'this_year') return d.getFullYear() === now.getFullYear();
    return true;
  });
}

function filterByQ<T extends { fecha_emision?: string; fecha?: string }>(
  items: T[], q: QFilter
): T[] {
  if (q === 'all') return items;
  const map: Record<string, number[]> = { Q1:[0,1,2], Q2:[3,4,5], Q3:[6,7,8], Q4:[9,10,11] };
  return items.filter(i => map[q].includes(new Date((i.fecha_emision||i.fecha) as string).getMonth()));
}

function StatCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--ivory-alt)', borderRadius: 12, padding: '20px 24px',
      border: '1px solid var(--linea)', flex: 1, minWidth: 180,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>{label}</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 22, fontWeight: 700, color }}>{value}</div>
        </div>
        <div style={{ color: 'var(--ink)', marginTop: 4 }}>{icon}</div>
      </div>
    </div>
  );
}

const RESET_CONFIRM = 'Esto BORRARÁ TODOS los datos (clientes, facturas, caja, visitas, jornadas) y reiniciará la numeración a cero.\n\nEsta acción no se puede deshacer. ¿Continuar?';
const RESET_SUCCESS = 'Todos los datos de prueba eliminados correctamente.';

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const [facturas, setFacturas]     = useState<Factura[]>([]);
  const [caja, setCaja]             = useState<CajaMovimiento[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('this_month');
  const [vatQ, setVatQ]             = useState<QFilter>('all');
  const [loading, setLoading]       = useState(true);
  const [resetting, setResetting]   = useState(false);
  const [loadError, setLoadError]   = useState('');

  const isAdmin = user?.role === 'super_admin';

  const load = () => Promise.all([
    apiFetch<Factura[]>('/ops/facturas'),
    apiFetch<CajaMovimiento[]>('/ops/caja'),
  ]).then(([f, c]) => { setFacturas(f); setCaja(c); setLoadError(''); });

  useEffect(() => {
    load()
      .catch(e => setLoadError(e instanceof Error ? e.message : 'Error cargando datos'))
      .finally(() => setLoading(false));
  }, []);

  async function handleReset() {
    if (!window.confirm(RESET_CONFIRM)) return;
    setResetting(true);
    try {
      await apiFetch('/ops/admin/reset', { method: 'POST' });
      alert(RESET_SUCCESS);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setResetting(false);
    }
  }

  const enriched = useMemo(() => facturas.map(f => ({
    ...f,
    estado: isOverdue(f) ? 'overdue' as const : f.estado,
  })), [facturas]);

  const filtered = filterByTime(enriched, timeFilter);
  const vatFiltered = filterByQ(enriched, vatQ);

  const collected   = filtered.filter(f => f.estado === 'collected').reduce((s, f) => s + f.total, 0);
  const outstanding = filtered.filter(f => ['sent','overdue'].includes(f.estado)).reduce((s, f) => s + f.total, 0);
  const cashBalance = caja.reduce((s, m) => s + (m.tipo === 'income' ? m.importe : -m.importe), 0);

  const in30days = new Date(); in30days.setDate(in30days.getDate() + 30);
  const forecast = enriched
    .filter(f => f.estado === 'sent' && f.fecha_vencimiento && new Date(f.fecha_vencimiento) <= in30days)
    .reduce((s, f) => s + f.total, 0);

  const overdueList = enriched.filter(f => f.estado === 'overdue');
  const outputVat   = vatFiltered.filter(f => f.estado === 'collected').reduce((s, f) => s + f.iva_importe, 0);
  const inputVat    = filterByQ(caja, vatQ).filter(m => m.tipo === 'expense').reduce((s, m) => s + m.iva_importe, 0);

  if (loading) return <div style={{ color: 'var(--muted)', padding: 40 }}>{t('ops.loading')}</div>;
  if (loadError) return (
    <div style={{ background: 'rgba(229,72,77,0.08)', border: '1px solid rgba(229,72,77,0.3)', borderRadius: 12, padding: '20px 24px', margin: 40, color: 'var(--rojo-text)', display: 'flex', alignItems: 'center', gap: 10 }}>
      <AlertTriangle size={18} /> {loadError}
    </div>
  );

  const timeOpts: { value: TimeFilter; label: string }[] = [
    { value: 'all',        label: t('ops.allTime') },
    { value: 'this_month', label: t('ops.thisMonth') },
    { value: 'last_month', label: t('ops.lastMonth') },
    { value: 'this_year',  label: t('ops.thisYear') },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>
          {t('ops.title')}
        </h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isAdmin && (
            <button onClick={handleReset} disabled={resetting} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(229,72,77,0.3)',
              background: 'rgba(229,72,77,0.08)', color: 'var(--rojo-text)',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>
              <Trash2 size={13} /> {resetting ? '...' : t('ops.resetData')}
            </button>
          )}
          <select
            value={timeFilter} onChange={e => setTimeFilter(e.target.value as TimeFilter)}
            style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }}
          >
            {timeOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <StatCard label={t('ops.collected')}   value={formatEur(collected)}   color="var(--verde-text)" icon={<TrendingUp size={28} />} />
        <StatCard label={t('ops.outstanding')} value={formatEur(outstanding)} color="var(--naranja-text)" icon={<Clock size={28} />} />
        <StatCard label={t('ops.cashBalance')} value={formatEur(cashBalance)} color="var(--teal-accent)" icon={<Wallet size={28} />} />
        <StatCard label={t('ops.forecast')}    value={formatEur(forecast)}    color="var(--muted)" icon={<BarChart3 size={28} />} />
      </div>

      {overdueList.length > 0 && (
        <div style={{
          background: 'rgba(229,72,77,0.08)', border: '1px solid rgba(229,72,77,0.3)',
          borderRadius: 12, padding: '16px 20px', marginBottom: 28,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <AlertTriangle size={16} color="var(--rojo-text)" />
            <span style={{ color: 'var(--rojo-text)', fontWeight: 700, fontSize: 14 }}>
              {t('ops.overdueInvoices')} ({overdueList.length})
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {overdueList.map(f => (
              <div key={f.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', background: 'rgba(229,72,77,0.05)', borderRadius: 8, fontSize: 13,
              }}>
                <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{f.cliente_nombre}</span>
                <span style={{ color: 'var(--muted-tint)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{f.numero}</span>
                <span style={{ color: 'var(--naranja-text)', fontFamily: 'JetBrains Mono, monospace' }}>{formatEur(f.total)}</span>
                <span style={{ color: 'var(--rojo-text)', fontSize: 12 }}>
                  {f.fecha_vencimiento ? `${daysOverdue(f.fecha_vencimiento)}${t('ops.daysOverdue')}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
        <div style={{ background: 'var(--ivory-alt)', borderRadius: 12, padding: '20px 24px', border: '1px solid var(--linea)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{t('ops.vatReport')}</h3>
            <select value={vatQ} onChange={e => setVatQ(e.target.value as QFilter)} style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}>
              {(['all','Q1','Q2','Q3','Q4'] as QFilter[]).map(q => (
                <option key={q} value={q}>{q === 'all' ? 'All' : q}</option>
              ))}
            </select>
          </div>
          {[
            { label: t('ops.outputVat'), value: outputVat,              color: 'var(--verde-text)' },
            { label: t('ops.inputVat'),  value: inputVat,               color: 'var(--rojo-text)' },
            { label: t('ops.netVat'),    value: outputVat - inputVat,   color: 'var(--naranja-text)' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--linea)', fontSize: 13 }}>
              <span style={{ color: 'var(--muted)' }}>{row.label}</span>
              <span style={{ color: row.color, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{formatEur(row.value)}</span>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--ivory-alt)', borderRadius: 12, padding: '20px 24px', border: '1px solid var(--linea)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{t('ops.recentCash')}</h3>
          {caja.slice(0, 5).map(m => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--linea)', fontSize: 13 }}>
              <div>
                <div style={{ color: 'var(--ink)', fontWeight: 500 }}>{m.concepto}</div>
                <div style={{ color: 'var(--muted)', fontSize: 11 }}>{formatDate(m.fecha)}</div>
              </div>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: m.tipo === 'income' ? 'var(--verde-text)' : 'var(--rojo-text)' }}>
                {m.tipo === 'income' ? '+' : '-'}{formatEur(m.importe)}
              </span>
            </div>
          ))}
          {caja.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{t('ops.noMovements')}</div>}
        </div>
      </div>

      <div style={{ background: 'var(--ivory-alt)', borderRadius: 12, padding: '20px 24px', border: '1px solid var(--linea)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{t('ops.latestInvoices')}</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--linea)' }}>
                {[t('ops.invoiceNumber'), t('ops.clientName'), t('ops.date'), t('ops.invoiceDue'), t('ops.total'), t('ops.status')].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted)', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enriched.slice(0, 8).map(f => (
                <tr key={f.id} style={{ borderBottom: '1px solid var(--linea-alta)' }}>
                  <td style={{ padding: '8px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--naranja-text)' }}>{f.numero}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--ink)' }}>{f.cliente_nombre}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{formatDate(f.fecha_emision)}</td>
                  <td style={{ padding: '8px 12px', color: f.estado === 'overdue' ? 'var(--rojo-text)' : 'var(--muted)' }}>{f.fecha_vencimiento ? formatDate(f.fecha_vencimiento) : '-'}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: 'var(--ink)' }}>{formatEur(f.total)}</td>
                  <td style={{ padding: '8px 12px' }}><StatusBadge estado={f.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {enriched.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>{t('ops.noInvoices')}</div>}
        </div>
      </div>
    </div>
  );
}

const STATUS_BADGE_MAP: Record<string, { bg: string; color: string; label: string }> = {
  draft:     { bg: 'rgba(15,46,56,0.15)', color: 'var(--muted-tint)', label: 'Draft' },
  sent:      { bg: 'rgba(23,129,127,0.15)',  color: 'var(--teal-tint)', label: 'Sent' },
  collected: { bg: 'rgba(23,129,127,0.15)',  color: 'var(--teal-tint)', label: 'Collected' },
  overdue:   { bg: 'rgba(229,72,77,0.15)',   color: 'var(--rojo-tint)', label: 'Overdue' },
  cancelled: { bg: 'rgba(15,46,56,0.15)', color: 'var(--muted-tint)', label: 'Cancelled' },
};

function StatusBadge({ estado }: { estado: string }) {
  const s = STATUS_BADGE_MAP[estado] || STATUS_BADGE_MAP.draft;
  return (
    <span style={{
      background: s.bg, color: s.color, borderRadius: 20,
      padding: '3px 10px', fontSize: 11, fontWeight: 600,
      fontFamily: 'DM Sans, sans-serif',
    }}>{s.label}</span>
  );
}
