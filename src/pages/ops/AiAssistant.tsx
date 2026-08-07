import { useState } from 'react';
import { apiFetch } from '../../lib/opsFetch';
import { useLang } from '../../context/LangContext';
import { Sparkles, TrendingUp, FileText, Users, Loader2 } from 'lucide-react';

type Mode = 'billing' | 'contracts' | 'accountant' | 'heidi';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div style={{ lineHeight: 1.7, fontSize: '0.88rem', color: 'var(--ink)' }}>
      {lines.map((line, i) => {
        const cleaned = line
          .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
          .replace(/\*(.+?)\*/g, '<i>$1</i>');
        if (line.startsWith('# '))  return <h2 key={i} style={{ color: 'var(--naranja-text)', marginTop: 16, fontSize: '1rem', fontFamily: 'Syne, sans-serif' }}>{line.slice(2)}</h2>;
        if (line.startsWith('## ')) return <h3 key={i} style={{ color: 'var(--naranja-text)', marginTop: 12, fontSize: '0.92rem', fontFamily: 'Syne, sans-serif' }}>{line.slice(3)}</h3>;
        if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} style={{ paddingLeft: 16, marginTop: 4 }}>• <span dangerouslySetInnerHTML={{ __html: cleaned.slice(2) }} /></div>;
        if (line.trim() === '') return <div key={i} style={{ height: 8 }} />;
        return <div key={i} dangerouslySetInnerHTML={{ __html: cleaned }} />;
      })}
    </div>
  );
}

const MODES: { id: Mode; icon: React.ComponentType<{ size?: number }>; labelEs: string; labelEn: string; descEs: string; descEn: string }[] = [
  { id: 'billing',    icon: TrendingUp, labelEs: 'Facturación',     labelEn: 'Billing',        descEs: 'Control de facturas, cobros y alertas de vencimiento', descEn: 'Invoice control, payments and overdue alerts' },
  { id: 'contracts',  icon: FileText,   labelEs: 'Contratos',       labelEn: 'Contracts',      descEs: 'Revisión de contratos cerrados por agentes de campo',  descEn: 'Review of contracts closed by field agents' },
  { id: 'accountant', icon: FileText,   labelEs: 'Informe gestor',  labelEn: 'Accountant',     descEs: 'Informe mensual para el gestor (IVA, Estonia OÜ, OSS)', descEn: 'Monthly accountant report (VAT, Estonia OÜ, OSS)' },
  { id: 'heidi',      icon: Users,      labelEs: 'Asistente Heidi', labelEn: 'Heidi Assistant', descEs: 'Consultas sobre clientes, planes y fiscal Estonia/UE',  descEn: 'Client DB, plans and Estonia/EU fiscal queries' },
];

export default function AiAssistant() {
  const { lang } = useLang();
  const isEs = lang === 'es';

  const [mode, setMode]       = useState<Mode>('billing');
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading]  = useState(false);

  // billing / contracts params
  const today   = new Date().toISOString().split('T')[0];
  const firstDom = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const [desde, setDesde]   = useState(firstDom);
  const [hasta, setHasta]   = useState(today);
  const [days, setDays]     = useState(30);
  const [mes, setMes]       = useState(new Date().getMonth() + 1);
  const [anio, setAnio]     = useState(new Date().getFullYear());

  async function runBilling() {
    setLoading(true);
    try {
      const res = await apiFetch<{ summary: string }>('/ai/ops/billing', {
        method: 'POST', body: JSON.stringify({ desde, hasta }),
      });
      setMessages(prev => [...prev, { role: 'assistant', text: res.summary }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${e instanceof Error ? e.message : 'unknown'}` }]);
    } finally { setLoading(false); }
  }

  async function runContracts() {
    setLoading(true);
    try {
      const res = await apiFetch<{ summary: string }>('/ai/ops/contracts-review', {
        method: 'POST', body: JSON.stringify({ days }),
      });
      setMessages(prev => [...prev, { role: 'assistant', text: res.summary }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${e instanceof Error ? e.message : 'unknown'}` }]);
    } finally { setLoading(false); }
  }

  async function runAccountant() {
    setLoading(true);
    try {
      const res = await apiFetch<{ report: string }>('/ai/ops/accountant-report', {
        method: 'POST', body: JSON.stringify({ mes, anio }),
      });
      setMessages(prev => [...prev, { role: 'assistant', text: res.report }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${e instanceof Error ? e.message : 'unknown'}` }]);
    } finally { setLoading(false); }
  }

  async function sendHeidi() {
    if (!question.trim()) return;
    const q = question.trim();
    setQuestion('');
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const res = await apiFetch<{ answer: string }>('/ai/ops/heidi', {
        method: 'POST', body: JSON.stringify({ question: q }),
      });
      setMessages(prev => [...prev, { role: 'assistant', text: res.answer }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${e instanceof Error ? e.message : 'unknown'}` }]);
    } finally { setLoading(false); }
  }

  const currentMode = MODES.find(m => m.id === mode)!;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Sparkles size={22} color="var(--naranja-text)" />
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>
            {isEs ? 'Asistente IA — OPS' : 'AI Assistant — OPS'}
          </h1>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '0.82rem', margin: 0 }}>
          Powered by Gemini 2.5 Flash · Novitum Technologies OÜ
        </p>
      </div>

      {/* Mode selector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
        {MODES.map(m => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button key={m.id} onClick={() => setMode(m.id)} style={{
              padding: '12px 10px', borderRadius: 10, border: `1px solid ${active ? 'var(--pulse)' : 'var(--linea)'}`,
              background: active ? 'rgba(255,122,26,0.12)' : 'var(--ivory-alt)',
              color: active ? 'var(--naranja-text)' : 'var(--muted)',
              cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Icon size={14} />
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '0.78rem' }}>
                  {isEs ? m.labelEs : m.labelEn}
                </span>
              </div>
              <div style={{ fontSize: '0.7rem', lineHeight: 1.3, fontFamily: 'DM Sans, sans-serif' }}>
                {isEs ? m.descEs : m.descEn}
              </div>
            </button>
          );
        })}
      </div>

      {/* Controls per mode */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>

        {mode === 'billing' && (<>
          <label style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{isEs ? 'Desde' : 'From'}</label>
          <input type="date" value={desde} max={today} onChange={e => setDesde(e.target.value)}
            style={inputStyle} />
          <label style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{isEs ? 'Hasta' : 'To'}</label>
          <input type="date" value={hasta} max={today} onChange={e => setHasta(e.target.value)}
            style={inputStyle} />
          <button onClick={runBilling} disabled={loading} style={btnStyle}>
            {loading ? <Loader2 size={14} className="spin" /> : null}
            {isEs ? '▶ Generar informe' : '▶ Generate report'}
          </button>
        </>)}

        {mode === 'contracts' && (<>
          <label style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{isEs ? 'Últimos' : 'Last'}</label>
          {[7, 15, 30, 60, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              ...chipStyle, background: days === d ? 'rgba(255,122,26,0.15)' : 'var(--ivory-alt)',
              color: days === d ? 'var(--naranja-text)' : 'var(--muted)',
              border: `1px solid ${days === d ? 'var(--pulse)' : 'var(--linea)'}`,
            }}>{d}d</button>
          ))}
          <button onClick={runContracts} disabled={loading} style={{ ...btnStyle, marginLeft: 'auto' }}>
            {isEs ? '▶ Analizar' : '▶ Analyse'}
          </button>
        </>)}

        {mode === 'accountant' && (<>
          <label style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{isEs ? 'Mes' : 'Month'}</label>
          <select value={mes} onChange={e => setMes(Number(e.target.value))} style={inputStyle}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i, 1).toLocaleString(isEs ? 'es-ES' : 'en-US', { month: 'long' })}
              </option>
            ))}
          </select>
          <select value={anio} onChange={e => setAnio(Number(e.target.value))} style={inputStyle}>
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={runAccountant} disabled={loading} style={btnStyle}>
            {isEs ? '▶ Generar informe gestor' : '▶ Generate accountant report'}
          </button>
        </>)}

        {mode === 'heidi' && (
          <span style={{ color: 'var(--muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
            {isEs ? 'Escribe tu consulta abajo' : 'Type your query below'}
          </span>
        )}
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
        gap: 14, marginBottom: 12, minHeight: 200,
      }}>
        {messages.length === 0 && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--muted)', fontSize: '0.85rem', textAlign: 'center', padding: 40,
          }}>
            <div>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✦</div>
              <div style={{ fontFamily: 'Syne, sans-serif', color: 'var(--ink)', marginBottom: 4 }}>
                {isEs ? currentMode.labelEs : currentMode.labelEn}
              </div>
              <div>{isEs ? currentMode.descEs : currentMode.descEn}</div>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            padding: '14px 18px', borderRadius: 10,
            background: msg.role === 'user' ? 'rgba(255,122,26,0.08)' : 'var(--ivory-alt)',
            border: `1px solid ${msg.role === 'user' ? 'rgba(255,122,26,0.2)' : 'var(--linea)'}`,
            alignSelf: msg.role === 'user' ? 'flex-end' : 'stretch',
            maxWidth: msg.role === 'user' ? '80%' : '100%',
          }}>
            {msg.role === 'user'
              ? <span style={{ color: 'var(--naranja-text)', fontSize: '0.88rem' }}>{msg.text}</span>
              : <MarkdownText text={msg.text} />
            }
          </div>
        ))}
        {loading && (
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            {isEs ? 'Analizando con Gemini...' : 'Analysing with Gemini...'}
          </div>
        )}
      </div>

      {/* Heidi chat input */}
      {mode === 'heidi' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            style={{ ...inputStyle, flex: 1, fontSize: '0.88rem' }}
            placeholder={isEs ? 'Pregunta sobre clientes, facturas, fiscal Estonia/UE...' : 'Ask about clients, invoices, Estonia/EU tax...'}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendHeidi()}
            disabled={loading}
          />
          <button onClick={sendHeidi} disabled={loading || !question.trim()} style={btnStyle}>
            {isEs ? 'Enviar' : 'Send'}
          </button>
        </div>
      )}

      {/* Clear */}
      {messages.length > 0 && (
        <button onClick={() => setMessages([])} style={{
          alignSelf: 'flex-start', background: 'none', border: 'none',
          color: 'var(--muted)', fontSize: '0.75rem', cursor: 'pointer', padding: '4px 0',
          fontFamily: 'DM Sans, sans-serif',
        }}>
          {isEs ? 'Limpiar conversación' : 'Clear conversation'}
        </button>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--ivory-alt)', border: '1px solid var(--linea)', borderRadius: 6,
  color: 'var(--ink)', padding: '6px 10px', fontSize: '0.8rem',
  fontFamily: 'DM Sans, sans-serif', outline: 'none',
};

const btnStyle: React.CSSProperties = {
  background: 'var(--pulse)', color: 'var(--petrol)', border: 'none', borderRadius: 6,
  padding: '7px 14px', fontSize: '0.82rem', fontWeight: 700,
  fontFamily: 'DM Sans, sans-serif', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
};

const chipStyle: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', cursor: 'pointer',
  fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, transition: 'all 0.15s',
};
