import { useState } from 'react';
import { useLang } from '../../context/LangContext';
import { ZONES } from '../../lib/zones';
import { apiFetch } from '../../lib/api';
import type { Lead } from '../../types';

export default function NewLeadModal({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const [form, setForm] = useState({
    name: '', type: 'local', zone: '', source: 'Google Maps', phone: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch<Lead>('/crm/leads', {
        method: 'POST',
        body: JSON.stringify({ ...form }),
      });
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
          <span className="modal-title">{t('lead.new')}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <p style={{ color: 'var(--rojo)', fontSize: '0.82rem', marginBottom: 8 }}>{error}</p>}
            <div className="form-field">
              <label className="form-label">{t('lead.name')} *</label>
              <input
                className="form-input"
                required
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Casa Paco · Tapas"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-field">
                <label className="form-label">{t('label.type')}</label>
                <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option value="local">Local / Bar / Rest.</option>
                  <option value="hotel">Hotel</option>
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">{t('label.zone')}</label>
                <select className="form-select" value={form.zone} onChange={e => setForm({ ...form, zone: e.target.value })}>
                  <option value="">— {t('label.zone')} —</option>
                  {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-field">
                <label className="form-label">{t('label.source')}</label>
                <select className="form-select" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
                  {['Google Maps', 'Instagram', 'Caminando', 'Referido', 'LinkedIn', 'Web'].map(s =>
                    <option key={s} value={s}>{s}</option>
                  )}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">{t('lead.phone')}</label>
                <input
                  className="form-input"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder="+34 600 000 000"
                />
              </div>
            </div>
            <div className="form-field">
              <label className="form-label">{t('label.notes')}</label>
              <textarea
                className="form-input"
                rows={3}
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Notas iniciales..."
                style={{ resize: 'vertical' }}
              />
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
