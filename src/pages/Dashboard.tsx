import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../context/LangContext';
import { apiFetch } from '../lib/api';
import type { Account, Activity, Task } from '../types';
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

interface DashStats { mrr: number; activeAccounts: number; totalLeads: number; pendingTasks: number }

export default function Dashboard() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [stats, setStats] = useState<DashStats>({ mrr: 0, activeAccounts: 0, totalLeads: 0, pendingTasks: 0 });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [topAccounts, setTopAccounts] = useState<Account[]>([]);

  useEffect(() => {
    const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    document.title = `Dashboard — ${today}`;
    Promise.all([
      apiFetch<DashStats>('/crm/dashboard'),
      apiFetch<Activity[]>('/crm/activities'),
      apiFetch<Task[]>('/crm/tasks'),
      apiFetch<Account[]>('/crm/accounts'),
    ]).then(([s, acts, tks, accs]) => {
      setStats(s);
      setActivities(acts.slice(0, 4));
      setTasks(tks.filter(t => !t.done).slice(0, 5));
      setTopAccounts(
        accs
          .filter(a => a.stage !== 'lost' && a.stage !== 'churned')
          .sort((a, b) => (b.pulse_score ?? 0) - (a.pulse_score ?? 0))
          .slice(0, 4)
      );
    }).catch(() => {});
  }, []);

  const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      {showModal && <NewLeadModal onClose={() => setShowModal(false)} />}

      <div className="topbar">
        <span className="topbar-title">{t('nav.dashboard')}</span>
        <div className="topbar-actions">
          <span style={{ fontSize: '0.75rem', color: 'var(--gris)', textTransform: 'capitalize' }}>{today}</span>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            {t('btn.newLead')}
          </button>
        </div>
      </div>

      <div className="page-content">
        <div className="kpi-grid">
          <div className="kpi-card" style={{ borderLeftColor: 'var(--naranja)' }}>
            <div className="kpi-label">{t('dash.activeLeads')}</div>
            <div className="kpi-value" style={{ color: 'var(--naranja)' }}>{stats.totalLeads}</div>
          </div>
          <div className="kpi-card" style={{ borderLeftColor: 'var(--verde)' }}>
            <div className="kpi-label">{t('dash.activeAccounts')}</div>
            <div className="kpi-value" style={{ color: 'var(--verde)' }}>{stats.activeAccounts}</div>
          </div>
          <div className="kpi-card" style={{ borderLeftColor: 'var(--gold)' }}>
            <div className="kpi-label">{t('dash.mrr')}</div>
            <div className="kpi-value" style={{ color: 'var(--gold)' }}>€{Number(stats.mrr).toLocaleString()}</div>
          </div>
          <div className="kpi-card" style={{ borderLeftColor: 'var(--rojo)' }}>
            <div className="kpi-label">{t('dash.overdue')}</div>
            <div className="kpi-value" style={{ color: 'var(--rojo)' }}>{stats.pendingTasks}</div>
          </div>
        </div>

        <div className="grid-3">
          <div className="card">
            <div className="card-title">
              {t('dash.recentActivity')}
              <span className="card-link" onClick={() => navigate('/activities')}>{t('common.seeAll')}</span>
            </div>
            {activities.length === 0 && <p style={{ color: 'var(--gris)', fontSize: '0.82rem' }}>Sin actividad reciente.</p>}
            {activities.map(a => {
              const ic = ACTIVITY_ICON[a.type] ?? ACTIVITY_ICON.system;
              return (
                <div className="activity-item" key={a.id}>
                  <div className="activity-icon" style={{ background: ic.bg }}>{ic.emoji}</div>
                  <div className="activity-body">
                    <div className="activity-desc">
                      {a.account_name && <strong>{a.account_name} — </strong>}
                      {a.description}
                    </div>
                    <div className="activity-time">{a.created_at.replace('T', ' ').slice(0, 16)} · {a.agent}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card">
            <div className="card-title">
              {t('dash.priorityTasks')}
              <span className="card-link" onClick={() => navigate('/tasks')}>{t('common.seeAll')}</span>
            </div>
            {tasks.length === 0 && <p style={{ color: 'var(--gris)', fontSize: '0.82rem' }}>Sin tareas pendientes.</p>}
            {tasks.map(task => (
              <div className="task-item" key={task.id}>
                <div className="task-priority" style={{ background: PRIORITY_COLOR[task.priority] }} />
                <div className="task-body">
                  <div className="task-title">{task.title}</div>
                  <div className="task-meta">
                    {task.due_at?.split('T')[0]} · {task.account_name ?? task.assigned_to}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-title">
              {t('dash.topPipeline')}
              <span className="card-link" onClick={() => navigate('/pipeline')}>{t('common.seeAll')}</span>
            </div>
            {topAccounts.map(a => (
              <div
                key={a.id}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 0', borderBottom: '1px solid rgba(136,146,176,0.06)', cursor: 'pointer',
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
            {topAccounts.length === 0 && <p style={{ color: 'var(--gris)', fontSize: '0.82rem' }}>Sin cuentas en pipeline.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
