import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../context/LangContext';
import { apiFetch } from '../lib/api';
import type { Account, PipelineStage } from '../types';
import PlanBadge from '../components/ui/PlanBadge';
import NewLeadModal from '../components/ui/NewLeadModal';

const STAGES: { key: PipelineStage; color: string }[] = [
  { key: 'new',               color: 'var(--muted-tint)' },
  { key: 'attempting_contact',color: 'var(--muted-tint)' },
  { key: 'contacted',         color: 'var(--teal-tint)' },
  { key: 'interested',        color: 'var(--teal-tint)' },
  { key: 'demo_scheduled',    color: 'var(--naranja-text)' },
  { key: 'proposal_sent',     color: 'var(--naranja-text)' },
  { key: 'negotiation',       color: 'var(--amarillo-text)' },
  { key: 'onboarding_pending',color: 'var(--purple)' },
  { key: 'payment_pending',   color: 'var(--purple)' },
  { key: 'active',            color: 'var(--verde-text)' },
  { key: 'at_risk',           color: 'var(--rojo-text)' },
];

export default function Pipeline() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [showModal, setShowModal] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    apiFetch<Account[]>('/crm/accounts').then(setAccounts).catch(() => {});
  }, []);

  const byStage = (stage: PipelineStage) => accounts.filter(a => a.stage === stage);

  return (
    <>
      {showModal && <NewLeadModal onClose={() => {
        setShowModal(false);
        apiFetch<Account[]>('/crm/accounts').then(setAccounts).catch(() => {});
      }} />}

      <div className="topbar">
        <span className="topbar-title">{t('nav.pipeline')}</span>
        <div className="topbar-actions">
          <button
            className={`btn ${view === 'kanban' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setView('kanban')}
          >⬡ Kanban</button>
          <button
            className={`btn ${view === 'list' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setView('list')}
          >≡ Lista</button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            {t('btn.newLead')}
          </button>
        </div>
      </div>

      <div className="page-content" style={{ flex: 1, overflow: 'hidden' }}>
        {view === 'kanban' ? (
          <div className="kanban-wrap">
            {STAGES.map(({ key, color }) => {
              const cards = byStage(key);
              return (
                <div className="kanban-col" key={key}>
                  <div className="kanban-header">
                    <span style={{ color }}>{t(`stage.${key}`)}</span>
                    <span className="kanban-count">{cards.length}</span>
                  </div>
                  <div className="kanban-cards">
                    {cards.map(a => (
                      <div className="k-card" key={a.id} onClick={() => navigate(`/accounts/${a.id}`)}>
                        <div className="k-name">{a.name}</div>
                        <div className="k-zone">{a.zone}</div>
                        <div className="k-plan">
                          <PlanBadge plan={a.plan} />
                        </div>
                        <div className="k-footer">
                          <div className="k-score">
                            {a.pulse_score ? `▲ ${a.pulse_score}` : '—'}
                          </div>
                          <div className="k-agent">{a.assigned_to}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('label.name')}</th>
                    <th>{t('label.plan')}</th>
                    <th>{t('label.stage')}</th>
                    <th>{t('label.zone')}</th>
                    <th>{t('label.agent')}</th>
                    <th>MRR</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(a => (
                    <tr key={a.id} onClick={() => navigate(`/accounts/${a.id}`)} style={{ cursor: 'pointer' }}>
                      <td className="td-name">{a.name}</td>
                      <td><PlanBadge plan={a.plan} /></td>
                      <td><span className="badge badge-gray">{t(`stage.${a.stage}`)}</span></td>
                      <td className="zone-tag">{a.zone}</td>
                      <td style={{ color: 'var(--muted-tint)', fontSize: '0.8rem' }}>{a.assigned_to}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: a.mrr > 0 ? 'var(--verde)' : 'var(--gris)' }}>
                        {a.mrr > 0 ? `€${a.mrr}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
