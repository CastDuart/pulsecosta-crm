import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useLang } from '../context/LangContext';
import { apiFetch } from '../lib/api';
import type { Account, Activity } from '../types';
import PlanBadge from '../components/ui/PlanBadge';
import StageBadge from '../components/ui/StageBadge';

const ACTIVITY_ICON: Record<string, { bg: string; emoji: string }> = {
  call:   { bg: 'rgba(56,189,248,0.15)', emoji: '📞' },
  email:  { bg: 'rgba(255,140,0,0.15)',  emoji: '✉️' },
  visit:  { bg: 'rgba(67,233,123,0.15)', emoji: '🚶' },
  note:   { bg: 'rgba(167,139,250,0.15)',emoji: '📝' },
  system: { bg: 'rgba(136,146,176,0.15)',emoji: '⚙️' },
};

export default function AccountDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLang();
  const [tab, setTab] = useState<'overview' | 'activity' | 'tasks'>('overview');
  const [account, setAccount] = useState<Account | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      apiFetch<Account[]>('/crm/accounts'),
      apiFetch<Activity[]>(`/crm/activities?account_id=${id}`),
    ]).then(([accs, acts]) => {
      setAccount(accs.find(a => a.id === Number(id)) ?? null);
      setActivities(acts);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="page-content" style={{ paddingTop: 60, textAlign: 'center' }}>
      <p style={{ color: 'var(--gris)' }}>Cargando...</p>
    </div>
  );

  if (!account) return (
    <div className="page-content" style={{ paddingTop: 60, textAlign: 'center' }}>
      <p style={{ color: 'var(--gris)' }}>Cuenta no encontrada.</p>
      <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => navigate('/accounts')}>
        ← Volver
      </button>
    </div>
  );

  return (
    <>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={() => navigate('/accounts')}>←</button>
          <span className="topbar-title">{account.name}</span>
          <PlanBadge plan={account.plan} />
          <StageBadge stage={account.stage} />
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={() => alert('Cambio de estado — próximamente')}>
            ↕ {t('label.stage')}
          </button>
          <button className="btn btn-primary" onClick={() => alert('Nueva actividad — próximamente')}>
            + {t('activity.note')}
          </button>
        </div>
      </div>

      <div className="page-content">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'MRR', value: account.mrr > 0 ? `€${account.mrr}/mes` : '—', color: 'var(--verde)' },
            { label: 'Pulse Score', value: account.pulse_score ? `▲ ${account.pulse_score}` : '—', color: 'var(--verde)' },
            { label: t('label.zone'), value: account.zone ?? '—', color: 'var(--blanco)' },
            { label: t('label.agent'), value: account.assigned_to ?? '—', color: 'var(--blanco)' },
          ].map(k => (
            <div key={k.label} className="kpi-card" style={{ borderLeftColor: 'var(--naranja)' }}>
              <div className="kpi-label">{k.label}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: k.color }}>
                {k.value}
              </div>
            </div>
          ))}
        </div>

        <div className="tabs">
          {(['overview', 'activity', 'tasks'] as const).map(tabKey => (
            <button
              key={tabKey}
              className={`tab${tab === tabKey ? ' active' : ''}`}
              onClick={() => setTab(tabKey)}
            >
              {tabKey === 'overview' ? 'Resumen' : tabKey === 'activity' ? t('nav.activities') : t('nav.tasks')}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="grid-2">
            <div className="card">
              <div className="card-title">{t('label.contact')}</div>
              <div className="detail-grid">
                <div>
                  <div className="detail-label">{t('label.name')}</div>
                  <div className="detail-value">{account.contact_name ?? '—'}</div>
                </div>
                <div>
                  <div className="detail-label">Email</div>
                  <div className="detail-value" style={{ fontSize: '0.82rem' }}>{account.contact_email ?? '—'}</div>
                </div>
                <div>
                  <div className="detail-label">Teléfono</div>
                  <div className="detail-value">{account.contact_phone ?? '—'}</div>
                </div>
                <div>
                  <div className="detail-label">Dirección</div>
                  <div className="detail-value" style={{ fontSize: '0.82rem' }}>{account.address ?? '—'}</div>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-title">Detalles del contrato</div>
              <div className="stat-row">
                <span className="stat-label">{t('label.plan')}</span>
                <span className="stat-val"><PlanBadge plan={account.plan} /></span>
              </div>
              <div className="stat-row">
                <span className="stat-label">MRR</span>
                <span className="stat-val" style={{ color: 'var(--verde)' }}>
                  {account.mrr > 0 ? `€${account.mrr}/mes` : '—'}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">MRR anual</span>
                <span className="stat-val" style={{ color: 'var(--gold)' }}>
                  {account.mrr > 0 ? `€${account.mrr * 12}/año` : '—'}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Alta</span>
                <span className="stat-val">{account.created_at?.split('T')[0]}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Última actualización</span>
                <span className="stat-val">{account.updated_at?.split('T')[0]}</span>
              </div>
              {account.notes && (
                <div className="stat-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                  <span className="stat-label">Notas</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--gris)', lineHeight: 1.5 }}>{account.notes}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'activity' && (
          <div className="card">
            <div className="card-title">{t('nav.activities')}</div>
            {activities.length === 0 ? (
              <p style={{ color: 'var(--gris)', fontSize: '0.82rem' }}>Sin actividad registrada.</p>
            ) : (
              activities.map(a => {
                const ic = ACTIVITY_ICON[a.type] ?? ACTIVITY_ICON.system;
                return (
                  <div className="activity-item" key={a.id}>
                    <div className="activity-icon" style={{ background: ic.bg }}>{ic.emoji}</div>
                    <div className="activity-body">
                      <div className="activity-desc">{a.description}</div>
                      <div className="activity-time">{a.created_at.replace('T', ' ').slice(0, 16)} · {a.agent}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === 'tasks' && (
          <div className="card">
            <div className="card-title">{t('nav.tasks')}</div>
            <p style={{ color: 'var(--gris)', fontSize: '0.82rem' }}>
              Las tareas asociadas a esta cuenta se gestionan desde la sección Tareas.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
