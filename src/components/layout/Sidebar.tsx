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
        <div className="brand-badge">CRM Comercial</div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">{t('sec.main')}</div>
        <NavItem to="/" icon="◈" label={t('nav.dashboard')} end />
        <NavItem to="/pipeline" icon="⬡" label={t('nav.pipeline')} />

        <div className="nav-section-label">{t('sec.prospecting')}</div>
        <NavItem to="/leads" icon="◎" label={t('nav.leads')} badge={12} badgeColor="orange" />
        <NavItem to="/accounts" icon="⬙" label={t('nav.accounts')} />

        <div className="nav-section-label">{t('sec.ops')}</div>
        <NavItem to="/tasks" icon="✓" label={t('nav.tasks')} badge={5} />
        <NavItem to="/activities" icon="↺" label={t('nav.activities')} />

        <div className="nav-section-label">{t('sec.analytics')}</div>
        <NavItem to="/reports" icon="📊" label={t('nav.reports')} />
        <NavItem to="/assistant" icon="✦" label={lang === 'es' ? 'Asistente IA' : 'AI Assistant'} />

        {user?.role === 'super_admin' && (
          <>
            <div className="nav-section-label" style={{ marginTop: '1rem', color: 'var(--orange)' }}>
              {t('ops.nav.section')}
            </div>
            <NavItem to="/ops" icon="◉" label={t('ops.nav.dashboard')} end />
            <NavItem to="/ops/invoices" icon="🧾" label={t('ops.nav.invoices')} />
            <NavItem to="/ops/cash" icon="💰" label={t('ops.nav.cash')} />
            <NavItem to="/ops/timelog" icon="⏱" label={t('ops.nav.timelog')} />
            <NavItem to="/ops/clients" icon="🏢" label={t('ops.nav.clients')} />
            <NavItem to="/ops/visits" icon="📍" label={t('ops.nav.visits')} />
            <NavItem to="/ops/venues" icon="🏬" label={t('ops.nav.venues')} />
            <NavItem to="/ops/ai" icon="✦" label={t('ops.nav.ai')} />
          </>
        )}
      </nav>

      <div className="lang-install-bar">
        <button
          className={`btn ${lang === 'es' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ flex: 1, justifyContent: 'center', fontSize: '0.72rem', padding: '5px 0' }}
          onClick={() => setLang('es')}
        >
          🇪🇸 ES
        </button>
        <button
          className={`btn ${lang === 'en' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ flex: 1, justifyContent: 'center', fontSize: '0.72rem', padding: '5px 0' }}
          onClick={() => setLang('en')}
        >
          🇬🇧 EN
        </button>
        <button
          className="btn btn-ghost"
          style={{ flex: 1, justifyContent: 'center', fontSize: '0.72rem', padding: '5px 0' }}
          title="Instalar app / Install app"
          onClick={() =>
            alert(
              '📱 Instalar PulseCosta CRM\n\n' +
              '🍎 iOS Safari → Compartir → Añadir a pantalla de inicio\n' +
              '🤖 Android/Chrome → Menú ⋮ → Instalar app\n' +
              '💻 Chrome desktop → Menú ⋮ → Install app'
            )
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
            title="Cerrar sesión / Sign out"
          >
            Super Admin
          </div>
        </div>
      </div>
    </aside>
  );
}
