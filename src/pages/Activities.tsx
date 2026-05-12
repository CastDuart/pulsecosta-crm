import { useLang } from '../context/LangContext';
import { MOCK_ACTIVITIES } from '../lib/mockData';

const ACTIVITY_CONFIG: Record<string, { bg: string; emoji: string }> = {
  call:   { bg: 'rgba(56,189,248,0.15)', emoji: '📞' },
  email:  { bg: 'rgba(255,140,0,0.15)',  emoji: '✉️' },
  visit:  { bg: 'rgba(67,233,123,0.15)', emoji: '🚶' },
  note:   { bg: 'rgba(167,139,250,0.15)',emoji: '📝' },
  system: { bg: 'rgba(136,146,176,0.15)',emoji: '⚙️' },
};

export default function Activities() {
  const { t } = useLang();

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">{t('nav.activities')}</span>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => alert('Nueva actividad — pendiente de conectar a API')}>
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
          <div className="card-title">
            {MOCK_ACTIVITIES.length} {t('nav.activities').toLowerCase()}
          </div>
          {MOCK_ACTIVITIES.map(a => {
            const ic = ACTIVITY_CONFIG[a.type] ?? ACTIVITY_CONFIG.system;
            return (
              <div className="activity-item" key={a.id}>
                <div className="activity-icon" style={{ background: ic.bg }}>{ic.emoji}</div>
                <div className="activity-body">
                  <div className="activity-desc">
                    {a.account_name && (
                      <strong style={{ color: 'var(--naranja)' }}>{a.account_name} — </strong>
                    )}
                    {a.description}
                  </div>
                  <div className="activity-time">
                    {a.created_at.replace('T', ' ')} · {a.agent} · {t(`activity.${a.type}`)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
