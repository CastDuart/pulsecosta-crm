import { useState } from 'react';
import { useLang } from '../../context/LangContext';
import ChipSelect from './ChipSelect';
import { apiFetch } from '../../lib/api';
import type { Activity } from '../../types';

export default function NewNoteModal({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const { t } = useLang();
  const [form, setForm] = useState({ type: 'note', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch<Activity>('/crm/activities', {
        method: 'POST',
        body: JSON.stringify({ type: form.type, description: form.description }),
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
          <span className="modal-title">{t('activity.note')}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <p style={{ color: 'var(--rojo)', fontSize: '0.82rem', marginBottom: 8 }}>{error}</p>}
            <div className="form-field">
              <label className="form-label">{t('label.type')}</label>
              <ChipSelect value={form.type} onChange={v => set('type', v)}
                options={[
                  { value: 'note', label: t('activity.note') },
                  { value: 'call', label: t('activity.call') },
                  { value: 'email', label: t('activity.email') },
                  { value: 'visit', label: t('activity.visit') },
                ]} />
            </div>
            <div className="form-field">
              <label className="form-label">{t('label.notes')} *</label>
              <textarea className="form-input" required rows={4} value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="Describe la actividad..." style={{ resize: 'vertical' }} />
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
