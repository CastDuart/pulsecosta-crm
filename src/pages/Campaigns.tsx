import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Mail, MessageCircle, Search, Send, Users } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { apiFetch } from '../lib/api';
import { apiFetch as opsFetch } from '../lib/opsFetch';
import type { Account, Lead } from '../types';

type Channel = 'email' | 'whatsapp';
type Audience = 'venues' | 'leads' | 'accounts' | 'manual';

type Venue = {
  id: string;
  name: string;
  category: string | null;
  zone_name: string | null;
  phone: string | null;
  email: string | null;
};

type VenueResp = { venues: Venue[]; total: number };

type Recipient = {
  id: string;
  name: string;
  source: string;
  category?: string | null;
  zone?: string | null;
  email?: string | null;
  phone?: string | null;
};

const LIST_STEP = 250;
async function loadAllVenues() {
  const limit = 500;
  let offset = 0;
  const all: Venue[] = [];

  while (true) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    const page = await opsFetch<VenueResp>(`/ops/venues?${params}`);
    all.push(...(page.venues || []));
    const total = page.total || all.length;
    if (all.length >= total) break;
    offset += limit;
  }

  return all;
}

function cleanPhone(phone?: string | null) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.length === 9) return `34${digits}`;
  return digits;
}

function fillTemplate(text: string, r?: Recipient) {
  if (!r) return text;
  return text.replaceAll('{nombre}', r.name);
}

function batchTemplate(text: string) {
  return text.replace(/\s*\{nombre\}/g, '');
}

function copyText(text: string) {
  return navigator.clipboard?.writeText(text).catch(() => undefined);
}

export default function Campaigns() {
  const { t } = useLang();
  const [audience, setAudience] = useState<Audience>('venues');
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [manual, setManual] = useState<Recipient[]>([]);
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [listLimit, setListLimit] = useState(LIST_STEP);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [campaignQueue, setCampaignQueue] = useState<Recipient[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [batchSize, setBatchSize] = useState(50);
  const [batchIndex, setBatchIndex] = useState(0);
  const [subject, setSubject] = useState(() => t('campaign.template.whatsapp.subject'));
  const [body, setBody] = useState(() => t('campaign.template.whatsapp.body'));
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setSubject(t(`campaign.template.${channel}.subject`));
    setBody(t(`campaign.template.${channel}.body`));
  }, [channel, t]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch<Lead[]>('/crm/leads'),
      apiFetch<Account[]>('/crm/accounts'),
      loadAllVenues(),
    ])
      .then(([leadRows, accountRows, venueRows]) => {
        if (!alive) return;
        setLeads(leadRows);
        setAccounts(accountRows);
        setVenues(venueRows);
      })
      .catch(e => setStatus(e instanceof Error ? e.message : t('campaign.statusLoadError')))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [t]);

  const categoryLabel = useCallback((category?: string | null) => (
    category ? t(`category.${category}`) : t('campaign.sourceVenueNoCategory')
  ), [t]);

  const recipients = useMemo<Recipient[]>(() => {
    if (audience === 'accounts') {
      return accounts.map(a => ({
        id: `account-${a.id}`,
        name: a.name,
        source: t('campaign.sourceAccount', { value: a.plan }),
        zone: a.zone,
        email: a.contact_email,
        phone: a.contact_phone,
      }));
    }
    if (audience === 'venues') {
      return venues.map(v => ({
        id: `venue-${v.id}`,
        name: v.name,
        source: t('campaign.sourceVenue', { value: categoryLabel(v.category) }),
        category: v.category,
        zone: v.zone_name,
        email: v.email,
        phone: v.phone,
      }));
    }
    if (audience === 'manual') return manual;
    return leads.map(l => ({
      id: `lead-${l.id}`,
      name: l.name,
      source: t('campaign.sourceLead', { value: t(`stage.${l.stage}`) }),
      zone: l.zone,
      email: l.email,
      phone: l.phone,
    }));
  }, [accounts, audience, categoryLabel, leads, manual, t, venues]);

  const zones = useMemo(() => [...new Set(venues.map(v => v.zone_name).filter((v): v is string => Boolean(v)))].sort(), [venues]);
  const categories = useMemo(() => [...new Set(venues.map(v => v.category).filter((v): v is string => Boolean(v)))].sort(), [venues]);
  const eligible = recipients.filter(r => (channel === 'email' ? r.email : cleanPhone(r.phone)));
  const visible = eligible.filter(r => {
    if (audience === 'venues' && zoneFilter && r.zone !== zoneFilter) return false;
    if (audience === 'venues' && categoryFilter && r.category !== categoryFilter) return false;
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [r.name, r.zone, r.source, r.email, r.phone].some(v => (v || '').toLowerCase().includes(needle));
  });
  const selected = visible.filter(r => selectedIds.has(r.id));
  const displayed = visible.slice(0, listLimit);
  const selectedDisplayed = displayed.filter(r => selectedIds.has(r.id));
  const allDisplayedSelected = displayed.length > 0 && selectedDisplayed.length === displayed.length;
  const allVisibleSelected = visible.length > 0 && selected.length === visible.length;
  const preview = fillTemplate(body, selected[0] || visible[0]);
  const activeRecipient = campaignQueue[queueIndex];
  const queueDone = sentIds.size + skippedIds.size;
  const queueFinished = campaignQueue.length > 0 && queueDone >= campaignQueue.length;
  const emailBatchRecipients = selected.filter(r => r.email);
  const batchCount = Math.ceil(emailBatchRecipients.length / batchSize);
  const currentBatchIndex = Math.min(batchIndex, Math.max(0, batchCount - 1));
  const currentBatch = emailBatchRecipients.slice(currentBatchIndex * batchSize, (currentBatchIndex + 1) * batchSize);
  const batchEmails = currentBatch.map(r => r.email).filter(Boolean).join(', ');

  const toggleDisplayed = () => {
    if (allDisplayedSelected) {
      const next = new Set(selectedIds);
      displayed.forEach(r => next.delete(r.id));
      setSelectedIds(next);
      return;
    }
    setSelectedIds(new Set([...selectedIds, ...displayed.map(r => r.id)]));
  };

  const toggleVisible = () => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(visible.map(r => r.id)));
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    setBatchIndex(0);
  };

  const emailHref = (r: Recipient) => {
    const params = new URLSearchParams({
      subject,
      body: fillTemplate(body, r),
    });
    return `mailto:${r.email}?${params.toString()}`;
  };

  const batchEmailHref = () => {
    const params = new URLSearchParams({
      bcc: batchEmails,
      subject,
      body: batchTemplate(body),
    });
    return `mailto:?${params.toString()}`;
  };

  const whatsappHref = (r: Recipient) => {
    const params = new URLSearchParams({ text: fillTemplate(body, r) });
    return `https://wa.me/${cleanPhone(r.phone)}?${params.toString()}`;
  };

  const recipientHref = (r: Recipient) => (channel === 'email' ? emailHref(r) : whatsappHref(r));

  const exportCsv = () => {
    const rows = selected.length ? selected : visible;
    const csv = [
      ['nombre', 'origen', 'zona', 'email', 'telefono'],
      ...rows.map(r => [r.name, r.source, r.zone || '', r.email || '', r.phone || '']),
    ]
      .map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    copyText(csv);
    setStatus(t('campaign.statusCsvCopied', { count: rows.length }));
  };

  const changeAudience = (next: Audience) => {
    setAudience(next);
    setListLimit(LIST_STEP);
    setZoneFilter('');
    setCategoryFilter('');
    setSelectedIds(new Set());
    setCampaignQueue([]);
    setBatchIndex(0);
  };

  const changeChannel = (next: Channel) => {
    setChannel(next);
    setSubject(t(`campaign.template.${next}.subject`));
    setBody(t(`campaign.template.${next}.body`));
    setListLimit(LIST_STEP);
    setSelectedIds(new Set());
    setCampaignQueue([]);
    setBatchIndex(0);
  };

  const changeSearch = (next: string) => {
    setSearch(next);
    setListLimit(LIST_STEP);
    setBatchIndex(0);
  };

  const changeZone = (next: string) => {
    setZoneFilter(next);
    setListLimit(LIST_STEP);
    setSelectedIds(new Set());
    setCampaignQueue([]);
    setBatchIndex(0);
  };

  const changeCategory = (next: string) => {
    setCategoryFilter(next);
    setListLimit(LIST_STEP);
    setSelectedIds(new Set());
    setCampaignQueue([]);
    setBatchIndex(0);
  };

  const startAssistedCampaign = () => {
    if (!selected.length) {
      setStatus(t('campaign.statusSelectFirst'));
      return;
    }
    setCampaignQueue(selected);
    setQueueIndex(0);
    setSentIds(new Set());
    setSkippedIds(new Set());
    setStatus(t('campaign.statusPrepared', { count: selected.length }));
  };

  const advanceQueue = (outcome: 'sent' | 'skipped') => {
    const current = campaignQueue[queueIndex];
    if (!current) return;
    const nextSent = new Set(sentIds);
    const nextSkipped = new Set(skippedIds);
    if (outcome === 'sent') nextSent.add(current.id);
    else nextSkipped.add(current.id);
    setSentIds(nextSent);
    setSkippedIds(nextSkipped);

    const nextIndex = queueIndex + 1;
    setQueueIndex(Math.min(nextIndex, campaignQueue.length));
    setStatus(
      nextIndex >= campaignQueue.length
        ? t('campaign.statusReviewed', { sent: nextSent.size, skipped: nextSkipped.size })
        : t('campaign.sentSkipped', { sent: nextSent.size, skipped: nextSkipped.size })
    );
  };

  const resetAssistedCampaign = () => {
    setCampaignQueue([]);
    setQueueIndex(0);
    setSentIds(new Set());
    setSkippedIds(new Set());
  };

  const addManualRecipient = () => {
    const name = manualName.trim();
    const email = manualEmail.trim();
    const phone = manualPhone.trim();
    if (!name || (!email && !phone)) {
      setStatus(t('campaign.statusManualMissing'));
      return;
    }
    const id = `manual-${Date.now()}`;
    const next = { id, name, source: t('campaign.sourceManual'), email, phone };
    setManual(prev => [next, ...prev]);
    setAudience('manual');
    setSelectedIds(new Set([id]));
    setManualName('');
    setManualEmail('');
    setManualPhone('');
    setStatus(t('campaign.statusManualAdded', { name }));
  };

  const copyBatchEmails = () => {
    copyText(batchEmails);
    setStatus(t('campaign.statusBatchEmailsCopied'));
  };

  const sendBatchWithBrevo = async () => {
    if (!currentBatch.length) return;
    if (!window.confirm(t('campaign.confirmBrevo', { count: currentBatch.length }))) return;
    try {
      const result = await apiFetch<{ sent: number }>('/crm/campaigns/email/send-batch', {
        method: 'POST',
        body: JSON.stringify({
          recipients: currentBatch.map(r => r.email),
          subject,
          body: batchTemplate(body),
        }),
      });
      setStatus(t('campaign.statusBrevoSent', { count: result.sent }));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : t('campaign.statusLoadError'));
    }
  };

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">{t('nav.campaigns')}</span>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={exportCsv}>
            <Copy size={15} /> {t('campaign.copyCsv')}
          </button>
        </div>
      </div>

      <div className="page-content campaigns-page">
        <section className="campaigns-toolbar">
          <div className="campaign-control">
            <span>{t('campaign.audience')}</span>
            <div className="segmented-control" role="group" aria-label={t('campaign.audience')}>
              <button className={audience === 'leads' ? 'active' : ''} onClick={() => changeAudience('leads')}>{t('campaign.leads')}</button>
              <button className={audience === 'accounts' ? 'active' : ''} onClick={() => changeAudience('accounts')}>{t('campaign.accounts')}</button>
              <button className={audience === 'venues' ? 'active' : ''} onClick={() => changeAudience('venues')}>{t('campaign.venues')}</button>
              <button className={audience === 'manual' ? 'active' : ''} onClick={() => changeAudience('manual')}>{t('campaign.manual')}</button>
            </div>
          </div>

          <div className="campaign-control">
            <span>{t('campaign.channel')}</span>
            <div className="segmented-control" role="group" aria-label={t('campaign.channel')}>
              <button className={channel === 'whatsapp' ? 'active' : ''} onClick={() => changeChannel('whatsapp')}>
                <MessageCircle size={15} /> WhatsApp
              </button>
              <button className={channel === 'email' ? 'active' : ''} onClick={() => changeChannel('email')}>
                <Mail size={15} /> Email
              </button>
            </div>
          </div>

          <div className="campaign-stats">
            <Users size={18} />
            <strong>{loading ? '...' : visible.length}</strong>
            <span>
              {loading
                ? t('campaign.loadingContacts')
                : t('campaign.selectedWithChannel', { count: selected.length, channel: channel === 'email' ? t('common.email') : t('common.phone') })}
            </span>
          </div>
        </section>

        {audience === 'venues' && (
          <section className="campaign-filters">
            <select aria-label={t('label.zone')} value={zoneFilter} onChange={e => changeZone(e.target.value)}>
              <option value="">{t('campaign.allZones')}</option>
              {zones.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
            <select aria-label={t('venues.category')} value={categoryFilter} onChange={e => changeCategory(e.target.value)}>
              <option value="">{t('campaign.allCategories')}</option>
              {categories.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
            </select>
          </section>
        )}

        <section className="manual-recipient">
          <div>
            <strong>{t('campaign.addManual')}</strong>
            <span>{t('campaign.addManualHelp')}</span>
          </div>
          <input value={manualName} onChange={e => setManualName(e.target.value)} placeholder={t('campaign.namePh')} />
          <input value={manualPhone} onChange={e => setManualPhone(e.target.value)} placeholder={t('common.phone')} />
          <input value={manualEmail} onChange={e => setManualEmail(e.target.value)} placeholder={t('common.email')} />
          <button className="btn btn-primary" onClick={addManualRecipient}>{t('campaign.add')}</button>
        </section>

        <section className="campaigns-grid">
          <div className="campaign-panel">
            <div className="campaign-panel-head">
              <h2>{t('campaign.message')}</h2>
              <button className="btn btn-ghost" onClick={() => { copyText(preview); setStatus(t('campaign.statusMessageCopied')); }}>
                <Copy size={15} /> {t('campaign.copy')}
              </button>
            </div>

            {channel === 'email' && (
              <label className="form-field">
                <span className="form-label">{t('campaign.subject')}</span>
                <input className="form-input" value={subject} onChange={e => setSubject(e.target.value)} />
              </label>
            )}

            <label className="form-field">
              <span className="form-label">{t('campaign.text')}</span>
              <textarea
                className="form-input campaign-textarea"
                value={body}
                onChange={e => setBody(e.target.value)}
              />
            </label>

            <div className="campaign-preview">
              <span>{t('campaign.preview')}</span>
              <p>{preview}</p>
            </div>
          </div>

          <div className="campaign-panel">
            <div className="campaign-panel-head">
              <div>
                <h2>{t('campaign.recipients')}</h2>
                <span className="campaign-panel-subtitle">
                  {t('campaign.showing', { shown: displayed.length, total: visible.length })}
                </span>
              </div>
              <div className="campaign-selection-actions">
                <button className="btn btn-ghost" onClick={toggleDisplayed} disabled={!displayed.length}>
                  {allDisplayedSelected ? t('campaign.unselectShown') : t('campaign.selectShown')}
                </button>
                <button className="btn btn-ghost" onClick={toggleVisible} disabled={!visible.length}>
                  {allVisibleSelected ? t('campaign.clearAll') : t('campaign.selectFiltered')}
                </button>
              </div>
            </div>

            <div className="campaign-search">
              <Search size={16} />
              <input value={search} onChange={e => changeSearch(e.target.value)} placeholder={t('campaign.searchPh')} />
            </div>

            {status && <div className="campaign-status">{status}</div>}
            <div className="campaign-assistant">
              <div className="campaign-assistant-head">
                <div>
                  <strong>{t('campaign.assisted')}</strong>
                  <span>
                    {campaignQueue.length
                      ? t('campaign.reviewed', { done: queueDone, total: campaignQueue.length })
                      : t('campaign.assistedHelp')}
                  </span>
                </div>
                <button className="btn btn-primary" onClick={startAssistedCampaign} disabled={!selected.length}>
                  {t('campaign.start')}
                </button>
              </div>

              {campaignQueue.length > 0 && (
                <div className="campaign-current">
                  {queueFinished ? (
                    <div>
                      <strong>{t('campaign.reviewedTitle')}</strong>
                      <span>{t('campaign.sentSkipped', { sent: sentIds.size, skipped: skippedIds.size })}</span>
                    </div>
                  ) : activeRecipient ? (
                    <>
                      <div>
                        <strong>{activeRecipient.name}</strong>
                        <span>{activeRecipient.source}{activeRecipient.zone ? ` · ${activeRecipient.zone}` : ''}</span>
                      </div>
                      <div className="campaign-current-actions">
                        <a
                          className="btn btn-primary"
                          href={recipientHref(activeRecipient)}
                          target={channel === 'email' ? undefined : '_blank'}
                          rel={channel === 'email' ? undefined : 'noopener noreferrer'}
                        >
                          {channel === 'email' ? <Mail size={15} /> : <Send size={15} />}
                          {t('campaign.open')}
                        </a>
                        <button className="btn btn-ghost" onClick={() => advanceQueue('sent')}>{t('campaign.markSent')}</button>
                        <button className="btn btn-ghost" onClick={() => advanceQueue('skipped')}>{t('campaign.skip')}</button>
                      </div>
                    </>
                  ) : null}
                  <button className="btn btn-ghost" onClick={resetAssistedCampaign}>{t('campaign.restart')}</button>
                </div>
              )}
            </div>
            {channel === 'email' && (
              <div className="campaign-assistant campaign-batches">
                <div className="campaign-assistant-head">
                  <div>
                    <strong>{t('campaign.emailBatches')}</strong>
                    <span>{emailBatchRecipients.length ? t('campaign.batchSummary', { current: currentBatchIndex + 1, total: batchCount, count: currentBatch.length }) : t('campaign.noEmailBatch')}</span>
                  </div>
                  <div className="campaign-current-actions">
                    <label className="campaign-batch-size">
                      <span>{t('campaign.batchSize')}</span>
                      <select value={batchSize} onChange={e => { setBatchSize(Number(e.target.value)); setBatchIndex(0); }}>
                        <option value={50}>50</option>
                        <option value={60}>60</option>
                      </select>
                    </label>
                  </div>
                </div>
                <div className="campaign-current">
                  <div>
                    <strong>{currentBatch.length ? batchEmails : t('campaign.emailBatches')}</strong>
                    <span>{t('campaign.batchPersonalizationWarning')}</span>
                  </div>
                  <div className="campaign-current-actions">
                    <button className="btn btn-ghost" onClick={() => setBatchIndex(i => Math.max(0, i - 1))} disabled={currentBatchIndex <= 0}>{t('campaign.prevBatch')}</button>
                    <button className="btn btn-ghost" onClick={() => setBatchIndex(i => Math.min(batchCount - 1, i + 1))} disabled={!batchCount || currentBatchIndex >= batchCount - 1}>{t('campaign.nextBatch')}</button>
                    <button className="btn btn-ghost" onClick={copyBatchEmails} disabled={!currentBatch.length}><Copy size={15} /> {t('campaign.copyBatchEmails')}</button>
                    <button className="btn btn-primary" onClick={sendBatchWithBrevo} disabled={!currentBatch.length}>{t('campaign.sendBrevo')}</button>
                    {currentBatch.length ? (
                      <a className="btn btn-ghost" href={batchEmailHref()}>{t('campaign.openBatch')}</a>
                    ) : (
                      <button className="btn btn-ghost" disabled>{t('campaign.openBatch')}</button>
                    )}
                  </div>
                </div>
              </div>
            )}
            {loading && <div className="campaign-empty">{t('campaign.loadingEmpty')}</div>}
            {!loading && !visible.length && <div className="campaign-empty">{t('campaign.noContacts')}</div>}

            <div className="recipient-list">
              {displayed.map(r => (
                <article className="recipient-row" key={r.id}>
                  <label>
                    <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleOne(r.id)} />
                    <span>
                      <strong>{r.name}</strong>
                      <small>{r.source}{r.zone ? ` · ${r.zone}` : ''}</small>
                    </span>
                  </label>
                  <a
                    className="icon-action"
                    href={recipientHref(r)}
                    target={channel === 'email' ? undefined : '_blank'}
                    rel={channel === 'email' ? undefined : 'noopener noreferrer'}
                    title={channel === 'email' ? t('campaign.openEmail') : t('campaign.openWhatsapp')}
                  >
                    {channel === 'email' ? <Mail size={16} /> : <Send size={16} />}
                    <ExternalLink size={13} />
                  </a>
                </article>
              ))}
            </div>
            {visible.length > displayed.length && (
              <button className="btn btn-ghost campaign-more" onClick={() => setListLimit(v => v + LIST_STEP)}>
                {t('campaign.more', { count: Math.min(LIST_STEP, visible.length - displayed.length), total: visible.length })}
              </button>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
