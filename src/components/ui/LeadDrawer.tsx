import { useState } from 'react';
import { useLang } from '../../context/LangContext';
import ChipSelect from './ChipSelect';
import { ZONES } from '../../lib/zones';
import { apiFetch } from '../../lib/api';
import { useNavigate } from 'react-router-dom';
import type { Lead } from '../../types';

const STAGES = ['new', 'attempting_contact', 'contacted', 'interested', 'converted'];
const SOURCES = ['Google Maps', 'Instagram', 'Caminando', 'Referido', 'LinkedIn', 'pulsefield'];

// Ficha de lead: editar datos, etapa y notas (PUT /api/crm/leads/:id). Antes las filas no se podían abrir.
export default function LeadDrawer({ lead, onClose, onSaved }: { lead: Lead; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const [form, setForm] = useState({
    name: lead.name, type: lead.type, zone: lead.zone ?? '', source: lead.source ?? '', stage: lead.stage,
    phone: lead.phone ?? '', email: lead.email ?? '', notes: lead.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const zones = ZONES.includes(form.zone) || !form.zone ? ZONES : [form.zone, ...ZONES];
  const sources = SOURCES.includes(form.source) || !form.source ? SOURCES : [form.source, ...SOURCES];

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try { await apiFetch<Lead>(`/crm/leads/${lead.id}`, { method: 'PUT', body: JSON.stringify(form) }); onSaved(); onClose(); }
    catch (err) { setError((err as Error).message ?? t('common.saveError')); }
    finally { setSaving(false); }
  };

  // Convertir lead en cuenta: crea la cuenta en el pipeline con los datos del lead y marca el lead como 'converted'.
  const convert = async () => {
    if (!window.confirm(t('lead.convertConfirm', { name: form.name }))) return;
    setConverting(true); setError('');
    try {
      const acc = await apiFetch<{ id: number }>('/crm/accounts', { method: 'POST', body: JSON.stringify({
        name: form.name, type: form.type, plan: 'free', stage: 'new', mrr: 0, zone: form.zone || null,
        contact_phone: form.phone || null, contact_email: form.email || null,
        notes: [form.notes, t('lead.originNote', { id: lead.id, source: form.source ? ` (${form.source})` : '' })].filter(Boolean).join('\n'),
      }) });
      await apiFetch<Lead>(`/crm/leads/${lead.id}`, { method: 'PUT', body: JSON.stringify({ ...form, stage: 'converted' }) });
      onSaved(); onClose(); navigate(`/accounts/${acc.id}`);
    } catch (err) { setError((err as Error).message ?? t('lead.convertError')); }
    finally { setConverting(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{lead.name}</span>
          <button className="modal-close" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>
        <form onSubmit={save}>
          <div className="modal-body">
            <div className="form-field">
              <label className="form-label">{t('label.status')}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {STAGES.map(s => (
                  <button key={s} type="button" onClick={() => setForm({ ...form, stage: s })} className={`btn ${form.stage === s ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 10px', fontSize: '0.75rem' }}>
                    {t(`stage.${s}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-field">
              <label className="form-label">{t('label.name')}</label>
              <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-field">
              <label className="form-label">{t('label.type')}</label>
              <ChipSelect value={form.type} onChange={v => setForm({ ...form, type: v as Lead['type'] })} options={[{ value: 'local', label: t('type.local') }, { value: 'hotel', label: t('type.hotel') }]} />
            </div>
            <div className="form-field">
              <label className="form-label">{t('label.zone')}</label>
              <select className="form-input" value={form.zone} onChange={e => setForm({ ...form, zone: e.target.value })}>
                <option value="">—</option>
                {zones.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">{t('label.source')}</label>
              <select className="form-input" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
                <option value="">—</option>
                {sources.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-field">
                <label className="form-label">{t('common.phone')}</label>
                <input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="form-field">
                <label className="form-label">{t('common.email')}</label>
                <input className="form-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            {(form.phone || form.email) && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {form.phone && <a className="btn btn-ghost" href={`tel:${form.phone.replace(/\s+/g, '')}`} style={{ fontSize: '0.75rem' }}>📞 {t('lead.call')}</a>}
                {form.phone && <a className="btn btn-ghost" href={`https://wa.me/${form.phone.replace(/\D/g, '').replace(/^(?!34)(\d{9})$/, '34$1')}`} target="_blank" rel="noopener" style={{ fontSize: '0.75rem' }}>💬 WhatsApp</a>}
                {form.email && <a className="btn btn-ghost" href={`mailto:${form.email}`} style={{ fontSize: '0.75rem' }}>✉️ Email</a>}
              </div>
            )}
            <div className="form-field">
              <label className="form-label">{t('label.notes')}</label>
              <textarea className="form-input" rows={4} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ resize: 'vertical' }} />
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--gris)' }}>
              {t('label.agent')}: {lead.assigned_to || '—'} · {t('label.date')}: {lead.created_at?.split('T')[0]}
            </div>
            {error && <div style={{ color: 'var(--rojo, #E5484D)', fontSize: '0.8rem', marginTop: 8 }}>{error}</div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t('btn.cancel')}</button>
            {lead.stage !== 'converted' && (
              <button type="button" className="btn btn-ghost" onClick={convert} disabled={converting || saving} style={{ marginRight: 'auto' }}>
                {converting ? t('lead.converting') : `➜ ${t('lead.convertToAccount')}`}
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? t('common.saving') : t('btn.save')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
