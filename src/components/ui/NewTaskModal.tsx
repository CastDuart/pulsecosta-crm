import { useState } from 'react';
import { useLang } from '../../context/LangContext';
import ChipSelect from './ChipSelect';
import { apiFetch } from '../../lib/api';
import type { Task } from '../../types';

export default function NewTaskModal({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const { t } = useLang();
  const [form, setForm] = useState({ title: '', priority: 'medium', due_at: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch<Task>('/crm/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: form.title, priority: form.priority, due_at: form.due_at || null }),
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
          <span className="modal-title">{t('nav.tasks')}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <p style={{ color: 'var(--rojo)', fontSize: '0.82rem', marginBottom: 8 }}>{error}</p>}
            <div className="form-field">
              <label className="form-label">{t('label.name')} *</label>
              <input className="form-input" required value={form.title}
                onChange={e => set('title', e.target.value)} placeholder="Llamar a Hotel Bahía" />
            </div>
            <div className="form-field">
              <label className="form-label">{t('label.priority')}</label>
              <ChipSelect value={form.priority} onChange={v => set('priority', v)}
                options={[
                  { value: 'urgent', label: t('priority.urgent') },
                  { value: 'high', label: t('priority.high') },
                  { value: 'medium', label: t('priority.medium') },
                  { value: 'low', label: t('priority.low') },
                ]} />
            </div>
            <div className="form-field">
              <label className="form-label">{t('label.date')}</label>
              <input className="form-input" type="date" value={form.due_at}
                onChange={e => set('due_at', e.target.value)} />
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
