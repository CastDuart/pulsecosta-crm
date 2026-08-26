import { useState } from 'react';
import { useLang } from '../../context/LangContext';
import ChipSelect from './ChipSelect';
import { ZONES } from '../../lib/zones';
import { apiFetch } from '../../lib/api';
import type { Account } from '../../types';

export default function NewAccountModal({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const { t } = useLang();
  const [form, setForm] = useState({
    name: '', type: 'local', plan: 'premium_local', stage: 'new', zone: '', mrr: '',
    contact_name: '', contact_email: '', contact_phone: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch<Account>('/crm/accounts', {
        method: 'POST',
        body: JSON.stringify({ ...form, mrr: Number(form.mrr) || 0 }),
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError((err as Error).message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{t('btn.newAccount')}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <p style={{ color: 'var(--rojo)', fontSize: '0.82rem', marginBottom: 8 }}>{error}</p>}
            <div className="form-field">
              <label className="form-label">{t('label.name')} *</label>
              <input className="form-input" required value={form.name}
                onChange={e => set('name', e.target.value)} placeholder="Hotel Bahía · Marbella" />
            </div>
            <div className="form-field">
              <label className="form-label">{t('label.type')}</label>
              <ChipSelect value={form.type} onChange={v => set('type', v)}
                options={[{ value: 'local', label: 'Local / Bar / Rest.' }, { value: 'hotel', label: 'Hotel' }]} />
            </div>
            <div className="form-field">
              <label className="form-label">{t('label.plan')}</label>
              <ChipSelect value={form.plan} onChange={v => set('plan', v)}
                options={[
                  { value: 'premium_local', label: t('plan.premium_local') },
                  { value: 'pro_bi', label: t('plan.pro_bi') },
                  { value: 'hotel_analytics', label: t('plan.hotel_analytics') },
                  { value: 'hotel_elite', label: t('plan.hotel_elite') },
                ]} />
            </div>
            <div className="form-field">
              <label className="form-label">{t('label.stage')}</label>
              <ChipSelect value={form.stage} onChange={v => set('stage', v)}
                options={[
                  { value: 'new', label: t('stage.new') },
                  { value: 'interested', label: t('stage.interested') },
                  { value: 'demo_scheduled', label: t('stage.demo_scheduled') },
                  { value: 'negotiation', label: t('stage.negotiation') },
                  { value: 'onboarding_pending', label: t('stage.onboarding_pending') },
                  { value: 'active', label: t('stage.active') },
                ]} />
            </div>
            <div className="form-field">
              <label className="form-label">{t('label.zone')}</label>
              <ChipSelect value={form.zone} onChange={v => set('zone', v)}
                options={ZONES.map(z => ({ value: z, label: z }))}
                allowEmpty emptyLabel={`— ${t('label.zone')} —`} searchPlaceholder={t('label.zone')} />
            </div>
            <div className="form-field">
              <label className="form-label">MRR (€)</label>
              <input className="form-input" type="number" min={0} value={form.mrr}
                onChange={e => set('mrr', e.target.value)} placeholder="0" />
            </div>
            <div className="form-field">
              <label className="form-label">{t('label.contact')}</label>
              <input className="form-input" value={form.contact_name}
                onChange={e => set('contact_name', e.target.value)} placeholder="Nombre del contacto" />
            </div>
            <div className="form-field">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.contact_email}
                onChange={e => set('contact_email', e.target.value)} placeholder="contacto@empresa.es" />
            </div>
            <div className="form-field">
              <label className="form-label">{t('lead.phone')}</label>
              <input className="form-input" value={form.contact_phone}
                onChange={e => set('contact_phone', e.target.value)} placeholder="+34 600 000 000" />
            </div>
            <div className="form-field">
              <label className="form-label">{t('label.notes')}</label>
              <textarea className="form-input" rows={3} value={form.notes}
                onChange={e => set('notes', e.target.value)} placeholder="Notas iniciales..." style={{ resize: 'vertical' }} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t('btn.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : t('btn.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
