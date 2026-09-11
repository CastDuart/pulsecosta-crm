import { useState } from 'react';
import { apiFetch } from '../../lib/opsFetch';
import { useLang, type Lang } from '../../context/LangContext';
import { Sparkles, TrendingUp, FileText, Users, Loader2 } from 'lucide-react';

type Mode = 'billing' | 'contracts' | 'accountant' | 'heidi';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');
  const inline = (line: string) => line
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
  const out: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    // Tablas markdown: | a | b |
    if (t.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        if (!cells.every(c => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      i--;
      out.push(
        <div key={`t${i}`} style={{ overflowX: 'auto', margin: '8px 0' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: 280 }}>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} style={{ background: ri === 0 ? 'rgba(0,0,0,0.05)' : 'transparent' }}>
                  {r.map((c, ci) => ri === 0
                    ? <th key={ci} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--border, #ddd)' }} dangerouslySetInnerHTML={{ __html: inline(c) }} />
                    : <td key={ci} style={{ padding: '5px 10px', borderBottom: '1px solid rgba(0,0,0,0.06)' }} dangerouslySetInnerHTML={{ __html: inline(c) }} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    if (/^-{3,}$/.test(t) || /^\*{3,}$/.test(t)) { out.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid rgba(0,0,0,0.1)', margin: '10px 0' }} />); continue; }
    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      const style = { color: 'var(--naranja-text)', marginTop: lvl <= 2 ? 16 : 12, marginBottom: 4, fontSize: lvl === 1 ? '1rem' : lvl === 2 ? '0.95rem' : '0.9rem', fontFamily: 'Syne, sans-serif' };
      out.push(lvl <= 2 ? <h3 key={i} style={style} dangerouslySetInnerHTML={{ __html: inline(h[2]) }} /> : <h4 key={i} style={style} dangerouslySetInnerHTML={{ __html: inline(h[2]) }} />);
      continue;
    }
    const li = t.match(/^[-*•]\s+(.*)$/) || t.match(/^(\d+)[.)]\s+(.*)$/);
    if (li) {
      const body = li.length === 3 ? `${li[1]}. ${li[2]}` : `• ${li[1]}`;
      out.push(<div key={i} style={{ paddingLeft: 16 + (line.length - line.trimStart().length) * 4, marginTop: 4 }} dangerouslySetInnerHTML={{ __html: inline(body) }} />);
      continue;
    }
    if (t === '') { out.push(<div key={i} style={{ height: 8 }} />); continue; }
    out.push(<div key={i} dangerouslySetInnerHTML={{ __html: inline(line) }} />);
  }
  return <div style={{ lineHeight: 1.7, fontSize: '0.88rem', color: 'var(--ink)' }}>{out}</div>;
}

const LOCALE_BY_LANG: Record<Lang, string> = { es: 'es-ES', en: 'en-GB', fi: 'fi-FI', et: 'et-EE' };

const MODES: { id: Mode; icon: React.ComponentType<{ size?: number }>; labelKey: string; descKey: string }[] = [
  { id: 'billing', icon: TrendingUp, labelKey: 'aiOps.mode.billing', descKey: 'aiOps.mode.billingDesc' },
  { id: 'contracts', icon: FileText, labelKey: 'aiOps.mode.contracts', descKey: 'aiOps.mode.contractsDesc' },
  { id: 'accountant', icon: FileText, labelKey: 'aiOps.mode.accountant', descKey: 'aiOps.mode.accountantDesc' },
  { id: 'heidi', icon: Users, labelKey: 'aiOps.mode.heidi', descKey: 'aiOps.mode.heidiDesc' },
];

export default function AiAssistant() {
  const { lang, t } = useLang();

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
      setMessages(prev => [...prev, { role: 'assistant', text: `${t('common.error')}: ${e instanceof Error ? e.message : t('common.unknownError')}` }]);
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
      setMessages(prev => [...prev, { role: 'assistant', text: `${t('common.error')}: ${e instanceof Error ? e.message : t('common.unknownError')}` }]);
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
      setMessages(prev => [...prev, { role: 'assistant', text: `${t('common.error')}: ${e instanceof Error ? e.message : t('common.unknownError')}` }]);
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
      setMessages(prev => [...prev, { role: 'assistant', text: `${t('common.error')}: ${e instanceof Error ? e.message : t('common.unknownError')}` }]);
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
            {t('aiOps.title')}
          </h1>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '0.82rem', margin: 0 }}>
          {t('aiOps.subtitle')}
        </p>
      </div>

      {/* Mode selector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 20 }}>
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
                  {t(m.labelKey)}
                </span>
              </div>
              <div style={{ fontSize: '0.7rem', lineHeight: 1.3, fontFamily: 'DM Sans, sans-serif' }}>
                {t(m.descKey)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Controls per mode */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>

        {mode === 'billing' && (<>
          <label style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{t('aiOps.from')}</label>
          <input type="date" value={desde} max={today} onChange={e => setDesde(e.target.value)}
            style={inputStyle} />
          <label style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{t('aiOps.to')}</label>
          <input type="date" value={hasta} max={today} onChange={e => setHasta(e.target.value)}
            style={inputStyle} />
          <button onClick={runBilling} disabled={loading} style={btnStyle}>
            {loading ? <Loader2 size={14} className="spin" /> : null}
            {t('aiOps.generateReport')}
          </button>
        </>)}

        {mode === 'contracts' && (<>
          <label style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{t('aiOps.last')}</label>
          {[7, 15, 30, 60, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              ...chipStyle, background: days === d ? 'rgba(255,122,26,0.15)' : 'var(--ivory-alt)',
              color: days === d ? 'var(--naranja-text)' : 'var(--muted)',
              border: `1px solid ${days === d ? 'var(--pulse)' : 'var(--linea)'}`,
            }}>{d}d</button>
          ))}
          <button onClick={runContracts} disabled={loading} style={{ ...btnStyle, marginLeft: 'auto' }}>
            {t('aiOps.analyze')}
          </button>
        </>)}

        {mode === 'accountant' && (<>
          <label style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{t('books.month')}</label>
          <select value={mes} onChange={e => setMes(Number(e.target.value))} style={inputStyle}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i, 1).toLocaleString(LOCALE_BY_LANG[lang], { month: 'long' })}
              </option>
            ))}
          </select>
          <select value={anio} onChange={e => setAnio(Number(e.target.value))} style={inputStyle}>
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={runAccountant} disabled={loading} style={btnStyle}>
            {t('aiOps.generateAccountant')}
          </button>
        </>)}

        {mode === 'heidi' && (
          <span style={{ color: 'var(--muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
            {t('aiOps.typeBelow')}
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
                {t(currentMode.labelKey)}
              </div>
              <div>{t(currentMode.descKey)}</div>
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
            {t('assistant.loading')}
          </div>
        )}
      </div>

      {/* Heidi chat input */}
      {mode === 'heidi' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            style={{ ...inputStyle, flex: 1, fontSize: '0.88rem' }}
            placeholder={t('aiOps.questionPh')}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendHeidi()}
            disabled={loading}
          />
          <button onClick={sendHeidi} disabled={loading || !question.trim()} style={btnStyle}>
            {t('assistant.send')}
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
          {t('assistant.clear')}
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
