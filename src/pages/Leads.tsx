import { useState } from 'react';
import { useLang } from '../context/LangContext';
import { MOCK_LEADS } from '../lib/mockData';
import { ZONES } from '../lib/zones';
import NewLeadModal from '../components/ui/NewLeadModal';

const STATUS_BADGE: Record<string, string> = {
  new: 'badge-gray',
  attempting_contact: 'badge-gray',
  contacted: 'badge-teal',
  interested: 'badge-orange',
  converted: 'badge-green',
};

export default function Leads() {
  const { t } = useLang();
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filterZone, setFilterZone] = useState('');
  const [filterAgent, setFilterAgent] = useState('');

  const filtered = MOCK_LEADS.filter(l => {
    if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterZone && l.zone !== filterZone) return false;
    if (filterAgent && l.assigned_to !== filterAgent) return false;
    return true;
  });

  return (
    <>
      {showModal && <NewLeadModal onClose={() => setShowModal(false)} />}

      <div className="topbar">
        <span className="topbar-title">{t('nav.leads')}</span>
        <div className="topbar-actions">
          <button className="btn btn-ghost">{t('btn.export')}</button>
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
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="filter-select" value={filterZone} onChange={e => setFilterZone(e.target.value)}>
            <option value="">{t('filter.allZones')}</option>
            {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
          <select className="filter-select">
            <option>{t('filter.allSources')}</option>
            {['Google Maps', 'Instagram', 'Caminando', 'Referido', 'LinkedIn'].map(s =>
              <option key={s}>{s}</option>
            )}
          </select>
          <select className="filter-select">
            <option>{t('filter.allStatuses')}</option>
            {['new', 'contacted', 'interested', 'converted'].map(s =>
              <option key={s}>{t(`stage.${s}`)}</option>
            )}
          </select>
          <select className="filter-select" value={filterAgent} onChange={e => setFilterAgent(e.target.value)}>
            <option value="">{t('filter.allAgents')}</option>
            <option>Cipry</option>
            <option>Heidi</option>
          </select>
        </div>

        <div className="card">
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
                  <tr key={l.id}>
                    <td className="td-name">{l.name}</td>
                    <td>
                      <span className={`badge ${l.type === 'hotel' ? 'badge-purple' : 'badge-teal'}`}>
                        {l.type === 'hotel' ? 'Hotel' : 'Local'}
                      </span>
                    </td>
                    <td className="zone-tag">{l.zone}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--gris)' }}>{l.source}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[l.status] ?? 'badge-gray'}`}>
                        {t(`stage.${l.status}`)}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--gris)' }}>{l.assigned_to}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--gris)', fontFamily: 'var(--font-mono)' }}>
                      {l.created_at}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--gris)', padding: '24px' }}>
                      {t('common.loading')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
