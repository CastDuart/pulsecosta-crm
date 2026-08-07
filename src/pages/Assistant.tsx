import { useState } from 'react';
import { apiFetch } from '../lib/api';
import { useLang } from '../context/LangContext';

type Mode = 'summary' | 'visits' | 'ask';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div style={{ lineHeight: 1.7, fontSize: '0.88rem', color: 'var(--blanco)' }}>
      {lines.map((line, i) => {
        const bold = line.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
        const cleaned = bold.replace(/\*(.+?)\*/g, '<i>$1</i>');
        if (line.startsWith('# '))  return <h2 key={i} style={{ color: 'var(--naranja)', marginTop: 16, fontSize: '1rem' }}>{line.slice(2)}</h2>;
        if (line.startsWith('## ')) return <h3 key={i} style={{ color: 'var(--naranja)', marginTop: 12, fontSize: '0.92rem' }}>{line.slice(3)}</h3>;
        if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} style={{ paddingLeft: 16, marginTop: 4 }}>• <span dangerouslySetInnerHTML={{ __html: cleaned.slice(2) }} /></div>;
        if (line.trim() === '') return <div key={i} style={{ height: 8 }} />;
        return <div key={i} dangerouslySetInnerHTML={{ __html: cleaned }} />;
      })}
    </div>
  );
}

export default function Assistant() {
  const { lang } = useLang();
  const [mode, setMode]       = useState<Mode>('summary');
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading]  = useState(false);
  const [date, setDate]        = useState(new Date().toISOString().split('T')[0]);

  const today = new Date().toISOString().split('T')[0];

  const labels = {
    summary: lang === 'es' ? 'Resumen del día' : 'Daily Summary',
    visits:  lang === 'es' ? 'Análisis de visitas' : 'Visit Analysis',
    ask:     lang === 'es' ? 'Preguntar' : 'Ask',
  };

  async function runSummary() {
    setLoading(true);
    try {
      const res = await apiFetch<{ summary: string; meta: Record<string, unknown> }>(
        '/ai/crm/daily-summary',
        { method: 'POST', body: JSON.stringify({ date }) }
      );
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `**${labels.summary} — ${date}**\n\n${res.summary}`,
      }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${e instanceof Error ? e.message : 'unknown'}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function runVisits() {
    setLoading(true);
    try {
      const res = await apiFetch<{ summary: string }>(
        '/ai/crm/visit-analysis',
        { method: 'POST', body: JSON.stringify({ date }) }
      );
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `**${labels.visits} — ${date}**\n\n${res.summary}`,
      }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${e instanceof Error ? e.message : 'unknown'}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function sendQuestion() {
    if (!question.trim()) return;
    const q = question.trim();
    setQuestion('');
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const res = await apiFetch<{ answer: string }>(
        '/ask',
        { method: 'POST', body: JSON.stringify({ question: q }) }
      );
      setMessages(prev => [...prev, { role: 'assistant', text: res.answer }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${e instanceof Error ? e.message : 'unknown'}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 800, margin: '0 auto', height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 800, color: 'var(--blanco)', margin: 0 }}>
          ✦ {lang === 'es' ? 'Asistente IA' : 'AI Assistant'}
        </h1>
        <p style={{ color: 'var(--gris)', fontSize: '0.82rem', marginTop: 4 }}>
          {lang === 'es' ? 'Powered by Gemini 2.5 Flash · PulseCosta CRM' : 'Powered by Gemini 2.5 Flash · PulseCosta CRM'}
        </p>
      </div>

      {/* Mode tabs + date */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        {(['summary', 'visits', 'ask'] as Mode[]).map(m => (
          <button
            key={m}
            className={`btn ${mode === m ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.8rem' }}
            onClick={() => setMode(m)}
          >
            {labels[m]}
          </button>
        ))}
        <input
          type="date"
          value={date}
          max={today}
          onChange={e => setDate(e.target.value)}
          className="form-input"
          style={{ width: 'auto', fontSize: '0.8rem', padding: '5px 10px', marginLeft: 'auto' }}
        />
      </div>

      {/* Action buttons */}
      {mode !== 'ask' && (
        <button
          className="btn btn-primary"
          style={{ marginBottom: 20, alignSelf: 'flex-start' }}
          disabled={loading}
          onClick={mode === 'summary' ? runSummary : runVisits}
        >
          {loading ? '⟳ Generando...' : `▶ ${lang === 'es' ? 'Generar' : 'Generate'} ${labels[mode]}`}
        </button>
      )}

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        marginBottom: 16,
        minHeight: 200,
      }}>
        {messages.length === 0 && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--gris)', fontSize: '0.85rem', textAlign: 'center', padding: 40,
          }}>
            {lang === 'es'
              ? 'Selecciona un modo y genera tu primer análisis.'
              : 'Select a mode and generate your first analysis.'}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            padding: '16px 20px',
            borderRadius: 12,
            background: msg.role === 'user' ? 'rgba(255,122,26,0.08)' : 'var(--azul-2)',
            border: `1px solid ${msg.role === 'user' ? 'rgba(255,122,26,0.2)' : 'var(--borde)'}`,
            alignSelf: msg.role === 'user' ? 'flex-end' : 'stretch',
            maxWidth: msg.role === 'user' ? '80%' : '100%',
          }}>
            {msg.role === 'user'
              ? <span style={{ color: 'var(--naranja)', fontSize: '0.88rem' }}>{msg.text}</span>
              : <MarkdownText text={msg.text} />
            }
          </div>
        ))}
        {loading && (
          <div style={{ color: 'var(--gris)', fontSize: '0.85rem', padding: '12px 20px' }}>
            ⟳ {lang === 'es' ? 'Analizando con Gemini...' : 'Analysing with Gemini...'}
          </div>
        )}
      </div>

      {/* Chat input (ask mode) */}
      {mode === 'ask' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="form-input"
            style={{ flex: 1, fontSize: '0.88rem' }}
            placeholder={lang === 'es' ? 'Pregunta algo sobre el CRM...' : 'Ask something about the CRM...'}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendQuestion()}
            disabled={loading}
          />
          <button className="btn btn-primary" onClick={sendQuestion} disabled={loading || !question.trim()}>
            {lang === 'es' ? 'Enviar' : 'Send'}
          </button>
        </div>
      )}

      {/* Clear */}
      {messages.length > 0 && (
        <button
          className="btn btn-ghost"
          style={{ marginTop: 8, fontSize: '0.75rem', alignSelf: 'flex-start', color: 'var(--gris)' }}
          onClick={() => setMessages([])}
        >
          {lang === 'es' ? 'Limpiar conversación' : 'Clear conversation'}
        </button>
      )}
    </div>
  );
}
