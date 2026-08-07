import { useState, useEffect } from 'react';
import { useLang } from '../context/LangContext';
import { apiFetch } from '../lib/api';
import type { Activity } from '../types';

const ACTIVITY_CONFIG: Record<string, { bg: string; emoji: string }> = {
  call:   { bg: 'rgba(23,129,127,0.15)', emoji: '📞' },
  email:  { bg: 'rgba(255,122,26,0.15)',  emoji: '✉️' },
  visit:  { bg: 'rgba(23,129,127,0.15)', emoji: '🚶' },
  note:   { bg: 'rgba(94,109,114,0.15)',emoji: '📝' },
  system: { bg: 'rgba(15,46,56,0.15)',emoji: '⚙️' },
};

export default function Activities() {
  const { t } = useLang();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Activity[]>('/crm/activities')
      .then(setActivities)
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">{t('nav.activities')}</span>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => alert('Nueva actividad — próximamente')}>
            + {t('activity.note')}
          </button>
        </div>
      </div>

      <div className="page-content">
        <div className="filter-bar">
          <select className="filter-select">
            <option>Todos los tipos</option>
            {['call', 'email', 'visit', 'note', 'system'].map(type => (
              <option key={type}>{t(`activity.${type}`)}</option>
            ))}
          </select>
          <select className="filter-select">
            <option>{t('filter.allAgents')}</option>
            <option>Cipry</option>
            <option>Heidi</option>
          </select>
          <select className="filter-select">
            <option>{t('common.thisMonth')}</option>
            <option>{t('common.thisWeek')}</option>
            <option>{t('common.today')}</option>
          </select>
        </div>

        <div className="card">
          {loading ? (
            <p style={{ color: 'var(--gris)', fontSize: '0.82rem', textAlign: 'center', padding: '24px 0' }}>Cargando...</p>
          ) : (
            <>
              <div className="card-title">{activities.length} {t('nav.activities').toLowerCase()}</div>
              {activities.length === 0 && (
                <p style={{ color: 'var(--gris)', fontSize: '0.82rem' }}>Sin actividades registradas.</p>
              )}
              {activities.map(a => {
                const ic = ACTIVITY_CONFIG[a.type] ?? ACTIVITY_CONFIG.system;
                return (
                  <div className="activity-item" key={a.id}>
                    <div className="activity-icon" style={{ background: ic.bg }}>{ic.emoji}</div>
                    <div className="activity-body">
                      <div className="activity-desc">
                        {a.account_name && (
                          <strong style={{ color: 'var(--naranja-text)' }}>{a.account_name} — </strong>
                        )}
                        {a.description}
                      </div>
                      <div className="activity-time">
                        {a.created_at.replace('T', ' ').slice(0, 16)} · {a.agent} · {t(`activity.${a.type}`)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </>
  );
}
