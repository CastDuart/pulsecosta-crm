import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function AppLayout() {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <main
        style={{
          marginLeft: 'var(--sidebar-w)',
          flex: 1,
          overflowY: 'auto',
          background: 'var(--azul)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
