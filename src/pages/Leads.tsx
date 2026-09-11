import { useState, useEffect } from 'react';
import { useLang } from '../context/LangContext';
import { ZONES } from '../lib/zones';
import { apiFetch } from '../lib/api';
import type { Lead } from '../types';
import NewLeadModal from '../components/ui/NewLeadModal';
import LeadDrawer from '../components/ui/LeadDrawer';
import { exportLeadsCsv } from '../lib/csv';

const STATUS_BADGE: Record<string, string> = {
  new: 'badge-gray',
  attempting_contact: 'badge-gray',
  contacted: 'badge-teal',
  interested: 'badge-orange',
  converted: 'badge-green',
};

export default function Leads() {
  const { t } = useLang();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [search, setSearch] = useState('');
  const [filterZone, setFilterZone] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [filterAgent, setFilterAgent] = useState('');

  const fetchLeads = () => {
    apiFetch<Lead[]>('/crm/leads')
      .then(setLeads)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLeads(); }, []);

  const zoneOptions = [...new Set([...ZONES, ...leads.map(l => l.zone).filter(Boolean)])];
  const filtered = leads.filter(l => {
    if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterZone && l.zone !== filterZone) return false;
    if (filterSource && l.source !== filterSource) return false;
    if (filterStage && l.stage !== filterStage) return false;
    if (filterAgent && l.assigned_to !== filterAgent) return false;
    return true;
  });
  const sourceOptions = [...new Set(leads.map(l => l.source).filter(Boolean))].sort();
  const stageOptions = [...new Set(leads.map(l => l.stage).filter(Boolean))].sort();

  return (
    <>
      {showModal && <NewLeadModal onClose={() => { setShowModal(false); fetchLeads(); }} />}
      {selected && <LeadDrawer lead={selected} onClose={() => setSelected(null)} onSaved={fetchLeads} />}

      <div className="topbar">
        <span className="topbar-title">{t('nav.leads')}</span>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={() => exportLeadsCsv(filtered)}>{t('btn.export')}</button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            {t('btn.newLead')}
          </button>
        </div>
      </div>

      <div className="page-content">
        <div className="filter-bar">
          <input
            className="filter-input"
            placeholder={`🔍  ${t('common.search')}`}
            aria-label={t('common.search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="filter-select" aria-label={t('label.zone')} value={filterZone} onChange={e => setFilterZone(e.target.value)}>
            <option value="">{t('filter.allZones')}</option>
            {zoneOptions.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
          <select className="filter-select" aria-label={t('label.source')} value={filterSource} onChange={e => setFilterSource(e.target.value)}>
            <option value="">{t('filter.allSources')}</option>
            {sourceOptions.map(s =>
              <option key={s} value={s}>{s}</option>
            )}
          </select>
          <select className="filter-select" aria-label={t('label.status')} value={filterStage} onChange={e => setFilterStage(e.target.value)}>
            <option value="">{t('filter.allStatuses')}</option>
            {stageOptions.map(s =>
              <option key={s} value={s}>{t(`stage.${s}`)}</option>
            )}
          </select>
          <select className="filter-select" aria-label={t('label.agent')} value={filterAgent} onChange={e => setFilterAgent(e.target.value)}>
            <option value="">{t('filter.allAgents')}</option>
            <option>Cipry</option>
            <option>Heidi</option>
          </select>
        </div>

        <div className="card">
          {loading ? (
            <p style={{ color: 'var(--gris)', fontSize: '0.82rem', textAlign: 'center', padding: '24px 0' }}>{t('common.loading')}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('label.name')}</th>
                    <th>{t('label.type')}</th>
                    <th>{t('label.zone')}</th>
                    <th>{t('label.source')}</th>
                    <th>{t('label.status')}</th>
                    <th>{t('label.agent')}</th>
                    <th>{t('label.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(l => (
                    <tr key={l.id} onClick={() => setSelected(l)} style={{ cursor: 'pointer' }} title={t('common.openRecord')}>
                      <td className="td-name">{l.name}</td>
                      <td>
                        <span className={`badge ${l.type === 'hotel' ? 'badge-purple' : 'badge-teal'}`}>
                          {l.type === 'hotel' ? t('type.hotel') : t('type.local')}
                        </span>
                      </td>
                      <td className="zone-tag">{l.zone}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--gris)' }}>{l.source}</td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[l.stage] ?? 'badge-gray'}`}>
                          {t(`stage.${l.stage}`)}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--gris)' }}>{l.assigned_to}</td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--gris)', fontFamily: 'var(--font-mono)' }}>
                        {l.created_at?.split('T')[0]}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', color: 'var(--gris)', padding: '24px' }}>
                        {t('leads.empty')}
                      </td>
                    </tr>
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
