import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function AppLayout() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { pathname } = useLocation();

  // En móvil el menú es un cajón: al navegar se cierra solo, o Heidi tendría
  // que cerrarlo a mano en cada salto de pantalla.
  useEffect(() => { setMenuAbierto(false); }, [pathname]);

  // Escape cierra el cajón, como cualquier panel modal.
  useEffect(() => {
    if (!menuAbierto) return;
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuAbierto(false); };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [menuAbierto]);

  return (
    <div className="app-shell">
      <button
        className="menu-toggle"
        onClick={() => setMenuAbierto(v => !v)}
        aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={menuAbierto}
        aria-controls="sidebar-principal"
      >
        <span /><span /><span />
      </button>

      <Sidebar id="sidebar-principal" className={menuAbierto ? 'open' : ''} />

      {menuAbierto && (
        <div className="sidebar-backdrop" onClick={() => setMenuAbierto(false)} />
      )}

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
