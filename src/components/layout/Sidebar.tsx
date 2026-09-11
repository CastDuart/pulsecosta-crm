import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LangContext';

function NavItem({
  to,
  icon,
  label,
  badge,
  badgeColor = 'red',
  end = false,
}: {
  to: string;
  icon: string;
  label: string;
  badge?: number;
  badgeColor?: 'red' | 'orange';
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
    >
      <span className="icon">{icon}</span>
      <span>{label}</span>
      {badge !== undefined && (
        <span className={`nav-badge${badgeColor === 'orange' ? ' orange' : ''}`}>{badge}</span>
      )}
    </NavLink>
  );
}

export default function Sidebar({ id, className = '' }: { id?: string; className?: string } = {}) {
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useLang();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside id={id} className={`sidebar${className ? ' ' + className : ''}`}>
      <div className="sidebar-brand">
        <div className="brand-name">
          <span className="brand-pulse">PULSE</span>
          <span className="brand-costa">COSTA</span>
        </div>
        <div className="brand-badge">{t('common.brandBadge')}</div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">{t('sec.main')}</div>
        <NavItem to="/" icon="◈" label={t('nav.dashboard')} end />
        <NavItem to="/pipeline" icon="⬡" label={t('nav.pipeline')} />

        <div className="nav-section-label">{t('sec.prospecting')}</div>
        <NavItem to="/leads" icon="◎" label={t('nav.leads')} />
        <NavItem to="/accounts" icon="⬙" label={t('nav.accounts')} />
        <NavItem to="/campaigns" icon="✉" label={t('nav.campaigns')} />

        <div className="nav-section-label">{t('sec.ops')}</div>
        <NavItem to="/tasks" icon="✓" label={t('nav.tasks')} />
        <NavItem to="/activities" icon="↺" label={t('nav.activities')} />

        <div className="nav-section-label">{t('sec.analytics')}</div>
        <NavItem to="/reports" icon="📊" label={t('nav.reports')} />
        <NavItem to="/assistant" icon="✦" label={t('nav.assistant')} />

        {user?.role === 'super_admin' && (
          <>
            <div className="nav-section-label" style={{ marginTop: '1rem', color: 'var(--orange)' }}>
              {t('ops.nav.section')}
            </div>
            <NavItem to="/ops" icon="◉" label={t('ops.nav.dashboard')} end />
            <NavItem to="/ops/invoices" icon="🧾" label={t('ops.nav.invoices')} />
            <NavItem to="/ops/cash" icon="💰" label={t('ops.nav.cash')} />
            <NavItem to="/ops/books" icon="📚" label={t('ops.nav.books')} />
            <NavItem to="/ops/bank" icon="🏦" label={t('ops.nav.bank')} />
            <NavItem to="/ops/timelog" icon="⏱" label={t('ops.nav.timelog')} />
            <NavItem to="/ops/clients" icon="🏢" label={t('ops.nav.clients')} />
            <NavItem to="/ops/visits" icon="📍" label={t('ops.nav.visits')} />
            <NavItem to="/ops/venues" icon="🏬" label={t('ops.nav.venues')} />
            <NavItem to="/ops/ai" icon="✦" label={t('ops.nav.ai')} />
          </>
        )}
      </nav>

      <div className="lang-install-bar" style={{ flexWrap: 'wrap' }}>
        {([
          ['es', '🇪🇸'],
          ['en', '🇬🇧'],
          ['fi', '🇫🇮'],
          ['et', '🇪🇪'],
        ] as const).map(([code, flag]) => (
          <button
            key={code}
            className={`btn ${lang === code ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flex: '1 0 32%', justifyContent: 'center', fontSize: '0.68rem', padding: '4px 0' }}
            onClick={() => setLang(code)}
          >
            {flag} {code.toUpperCase()}
          </button>
        ))}
        <button
          className="btn btn-ghost"
          style={{ flex: 1, justifyContent: 'center', fontSize: '0.72rem', padding: '5px 0' }}
          title={t('app.installTitle')}
          onClick={() =>
            alert(t('app.installInstructions'))
          }
        >
          📱
        </button>
      </div>

      <div className="sidebar-user">
        <div className="user-avatar">{user?.initials ?? '?'}</div>
        <div className="user-info">
          <div className="user-name">{user?.name}</div>
          <div
            className="user-role"
            style={{ cursor: 'pointer' }}
            onClick={handleLogout}
            title={t('auth.signOut')}
          >
            {t('role.superAdmin')}
          </div>
        </div>
      </div>
    </aside>
  );
}
