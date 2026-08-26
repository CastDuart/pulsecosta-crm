import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useLang } from '../context/LangContext';
import { ZONES } from '../lib/zones';
import { apiFetch } from '../lib/api';
import type { Account } from '../types';
import PlanBadge from '../components/ui/PlanBadge';
import StageBadge from '../components/ui/StageBadge';
import NewAccountModal from '../components/ui/NewAccountModal';

export default function Accounts() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [filterZone, setFilterZone] = useState('');
  const [showModal, setShowModal] = useState(false);

  const load = () => apiFetch<Account[]>('/crm/accounts').then(setAccounts).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const filtered = accounts.filter(a => {
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterPlan && a.plan !== filterPlan) return false;
    if (filterZone && a.zone !== filterZone) return false;
    return true;
  });

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">{t('nav.accounts')}</span>
        <div className="topbar-actions">
          <button className="btn btn-ghost">{t('btn.export')}</button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>{t('btn.newAccount')}</button>
        </div>
      </div>

      {showModal && <NewAccountModal onClose={() => setShowModal(false)} onSaved={load} />}

      <div className="page-content">
        <div className="filter-bar">
          <input
            className="filter-input"
            placeholder={`🔍  ${t('common.search')}`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="filter-select" value={filterPlan} onChange={e => setFilterPlan(e.target.value)}>
            <option value="">{t('filter.allPlans')}</option>
            <option value="premium_local">{t('plan.premium_local')}</option>
            <option value="pro_bi">{t('plan.pro_bi')}</option>
            <option value="hotel_analytics">{t('plan.hotel_analytics')}</option>
            <option value="hotel_elite">{t('plan.hotel_elite')}</option>
          </select>
          <select className="filter-select" value={filterZone} onChange={e => setFilterZone(e.target.value)}>
            <option value="">{t('filter.allZones')}</option>
            {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
          <select className="filter-select">
            <option>{t('filter.allStatuses')}</option>
            <option>{t('stage.active')}</option>
            <option>{t('stage.at_risk')}</option>
            <option>{t('stage.onboarding_pending')}</option>
          </select>
        </div>

        <div className="card">
          {loading ? (
            <p style={{ color: 'var(--gris)', fontSize: '0.82rem', padding: '24px 0', textAlign: 'center' }}>Cargando...</p>
          ) : (
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
                    <th>Pulse</th>
                    <th>{t('label.contact')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(a => (
                    <tr key={a.id} onClick={() => navigate(`/accounts/${a.id}`)} style={{ cursor: 'pointer' }}>
                      <td>
                        <div className="td-name">{a.name}</div>
                        <div className="zone-tag">{a.plan?.includes('hotel') ? '🏨' : '🍽️'}</div>
                      </td>
                      <td><PlanBadge plan={a.plan} /></td>
                      <td><StageBadge stage={a.stage} /></td>
                      <td className="zone-tag">{a.zone}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--gris)' }}>{a.assigned_to}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: a.mrr > 0 ? 'var(--verde)' : 'var(--gris)' }}>
                        {a.mrr > 0 ? `€${a.mrr}` : '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--verde)' }}>
                        {a.pulse_score ? `▲ ${a.pulse_score}` : '—'}
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--gris)' }}>{a.contact_name ?? '—'}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && !loading && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--gris)', padding: '24px 0' }}>Sin cuentas</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
