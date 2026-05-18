import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';

export default function Login() {
  const { login } = useAuth();
  const { lang, setLang, t } = useLang();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) { setError('Introduce tu contraseña'); return; }
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch {
      setError('Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', gap: 8 }}>
        <button
          className={`btn ${lang === 'es' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setLang('es')}
        >🇪🇸 ES</button>
        <button
          className={`btn ${lang === 'en' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setLang('en')}
        >🇬🇧 EN</button>
      </div>

      <div className="login-card">
        <div className="login-brand">
          <span className="brand-pulse">PULSE</span>
          <span className="brand-costa" style={{ marginLeft: 8 }}>COSTA</span>
        </div>
        <p className="login-sub">CRM · Panel Comercial</p>

        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@pulsecosta.es"
              autoComplete="email"
            />
          </div>
          <div className="form-field">
            <label className="form-label">{lang === 'en' ? 'Password' : 'Contraseña'}</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p style={{ color: 'var(--rojo)', fontSize: '0.78rem', marginBottom: 12 }}>{error}</p>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: 12, fontSize: '0.9rem', marginTop: 8 }}
          >
            {loading ? '...' : t('btn.signin')}
          </button>
        </form>

        <p className="login-footer">Fuengirola · Marbella · Estepona · Costa del Sol</p>
      </div>
    </div>
  );
}
