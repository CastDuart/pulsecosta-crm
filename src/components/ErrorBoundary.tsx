import { Component, type ReactNode } from 'react';

// Red de seguridad: un error de render en cualquier página muestra un aviso con botón de recarga en vez de una pantalla en blanco.
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('[CRM] error de render:', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 32, maxWidth: 640, margin: '40px auto', fontFamily: 'inherit' }}>
        <h2 style={{ marginTop: 0 }}>Algo ha fallado en esta pantalla</h2>
        <p style={{ color: '#67787E' }}>El resto del CRM sigue funcionando. Recarga la página o vuelve al inicio. Detalle técnico:</p>
        <pre style={{ background: 'rgba(0,0,0,0.05)', padding: 12, borderRadius: 8, fontSize: 12, overflow: 'auto' }}>{String(this.state.error?.message || this.state.error)}</pre>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => window.location.reload()} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #ccc', background: 'none', cursor: 'pointer' }}>Recargar</button>
          <a href="/" style={{ padding: '8px 14px', borderRadius: 8, background: '#FF7A1A', color: '#0F2E38', textDecoration: 'none', fontWeight: 700 }}>Ir al inicio</a>
        </div>
      </div>
    );
  }
}
