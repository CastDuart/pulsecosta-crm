import { useState } from 'react';
import { useLang } from '../../context/LangContext';
import ChipSelect from './ChipSelect';
import { apiFetch } from '../../lib/api';
import type { Account } from '../../types';

const STAGES = [
  'new', 'attempting_contact', 'contacted', 'interested', 'demo_scheduled',
  'proposal_sent', 'negotiation', 'onboarding_pending', 'payment_pending',
  'active', 'at_risk', 'churned', 'lost',
];

export default function ChangeStageModal({ accountId, current, onClose, onSaved }: {
  accountId: number; current: string; onClose: () => void; onSaved?: () => void;
}) {
  const { t } = useLang();
  const [stage, setStage] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch<Account>(`/crm/accounts/${accountId}`, {
        method: 'PUT',
        body: JSON.stringify({ stage }),
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
          <span className="modal-title">{t('label.stage')}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <p style={{ color: 'var(--rojo)', fontSize: '0.82rem', marginBottom: 8 }}>{error}</p>}
            <div className="form-field">
              <label className="form-label">{t('label.stage')}</label>
              <ChipSelect value={stage} onChange={setStage}
                options={STAGES.map(s => ({ value: s, label: t(`stage.${s}`) }))} />
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
