import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../context/LangContext';
import { MOCK_ACCOUNTS, MOCK_ACTIVITIES, MOCK_TASKS } from '../lib/mockData';
import PlanBadge from '../components/ui/PlanBadge';
import NewLeadModal from '../components/ui/NewLeadModal';

const ACTIVITY_ICON: Record<string, { bg: string; emoji: string }> = {
  call:   { bg: 'rgba(56,189,248,0.15)', emoji: '📞' },
  email:  { bg: 'rgba(255,140,0,0.15)',  emoji: '✉️' },
  visit:  { bg: 'rgba(67,233,123,0.15)', emoji: '🚶' },
  note:   { bg: 'rgba(167,139,250,0.15)',emoji: '📝' },
  system: { bg: 'rgba(136,146,176,0.15)',emoji: '⚙️' },
};

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'var(--rojo)',
  high:   'var(--naranja)',
  medium: 'var(--amarillo)',
  low:    'var(--gris)',
};

export default function Dashboard() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);

  const activeAccounts = MOCK_ACCOUNTS.filter(a => a.stage === 'active');
  const mrr = activeAccounts.reduce((s, a) => s + a.mrr, 0);
  const topPipeline = MOCK_ACCOUNTS.filter(a => a.stage !== 'lost' && a.stage !== 'churned')
    .sort((a, b) => (b.pulse_score ?? 0) - (a.pulse_score ?? 0))
    .slice(0, 4);

  return (
    <>
      {showModal && <NewLeadModal onClose={() => setShowModal(false)} />}

      <div className="topbar">
        <span className="topbar-title">{t('nav.dashboard')}</span>
        <div className="topbar-actions">
          <span style={{ fontSize: '0.75rem', color: 'var(--gris)' }}>Lun 12 Mayo 2026</span>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            {t('btn.newLead')}
          </button>
        </div>
      </div>

      <div className="page-content">
        {/* KPIs */}
        <div className="kpi-grid">
          <div className="kpi-card" style={{ borderLeftColor: 'var(--naranja)' }}>
            <div className="kpi-label">{t('dash.activeLeads')}</div>
            <div className="kpi-value" style={{ color: 'var(--naranja)' }}>28</div>
            <div className="kpi-delta up">▲ +6 {t('common.thisWeek')}</div>
          </div>
          <div className="kpi-card" style={{ borderLeftColor: 'var(--verde)' }}>
            <div className="kpi-label">{t('dash.activeAccounts')}</div>
            <div className="kpi-value" style={{ color: 'var(--verde)' }}>{activeAccounts.length}</div>
            <div className="kpi-delta up">▲ +2 {t('common.thisMonth')}</div>
          </div>
          <div className="kpi-card" style={{ borderLeftColor: 'var(--gold)' }}>
            <div className="kpi-label">{t('dash.mrr')}</div>
            <div className="kpi-value" style={{ color: 'var(--gold)' }}>€{mrr.toLocaleString()}</div>
            <div className="kpi-delta up">▲ +€290 vs mes anterior</div>
          </div>
          <div className="kpi-card" style={{ borderLeftColor: 'var(--rojo)' }}>
            <div className="kpi-label">{t('dash.overdue')}</div>
            <div className="kpi-value" style={{ color: 'var(--rojo)' }}>5</div>
            <div className="kpi-delta down">▼ {t('common.today')}</div>
          </div>
        </div>

        <div className="grid-3">
          {/* Actividad reciente */}
          <div className="card">
            <div className="card-title">
              {t('dash.recentActivity')}
              <span className="card-link" onClick={() => navigate('/activities')}>
                {t('common.seeAll')}
              </span>
            </div>
            {MOCK_ACTIVITIES.slice(0, 4).map(a => {
              const ic = ACTIVITY_ICON[a.type] ?? ACTIVITY_ICON.system;
              return (
                <div className="activity-item" key={a.id}>
                  <div className="activity-icon" style={{ background: ic.bg }}>{ic.emoji}</div>
                  <div className="activity-body">
                    <div className="activity-desc">
                      {a.account_name && <strong>{a.account_name} — </strong>}
                      {a.description}
                    </div>
                    <div className="activity-time">{a.created_at.replace('T', ' ')} · {a.agent}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tareas prioritarias */}
          <div className="card">
            <div className="card-title">
              {t('dash.priorityTasks')}
              <span className="card-link" onClick={() => navigate('/tasks')}>{t('common.seeAll')}</span>
            </div>
            {MOCK_TASKS.map(task => (
              <div className="task-item" key={task.id}>
                <div className="task-priority" style={{ background: PRIORITY_COLOR[task.priority] }} />
                <div className="task-body">
                  <div className="task-title">{task.title}</div>
                  <div className="task-meta">
                    {task.due_at.split('T')[0]} · {task.account_name ?? task.assigned_to}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Top Pipeline */}
          <div className="card">
            <div className="card-title">
              {t('dash.topPipeline')}
              <span className="card-link" onClick={() => navigate('/pipeline')}>{t('common.seeAll')}</span>
            </div>
            {topPipeline.map(a => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid rgba(136,146,176,0.06)',
                  cursor: 'pointer',
                }}
                onClick={() => navigate(`/accounts/${a.id}`)}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{a.name}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--gris)' }}>{a.zone}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <PlanBadge plan={a.plan} />
                  {a.pulse_score && (
                    <div style={{ fontSize: '0.68rem', color: 'var(--verde)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                      ▲ {a.pulse_score}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
