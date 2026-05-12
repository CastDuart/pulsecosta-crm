import { useState } from 'react';
import { useLang } from '../context/LangContext';
import { ZONES } from '../lib/zones';
import { MOCK_ACCOUNTS } from '../lib/mockData';

type ReportType = 'executive' | 'pipeline' | 'activity' | 'leads' | 'billing' | 'agents';
type Period = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

const mrr = (accounts = MOCK_ACCOUNTS) => accounts.filter(a => a.stage === 'active').reduce((s, a) => s + a.mrr, 0);

export default function Reports() {
  const { t } = useLang();
  const [reportType, setReportType] = useState<ReportType>('executive');
  const [period, setPeriod] = useState<Period>('month');

  const REPORT_TYPES: { key: ReportType; label: string }[] = [
    { key: 'executive', label: t('report.executive') },
    { key: 'pipeline',  label: t('report.pipeline') },
    { key: 'activity',  label: t('report.activity') },
    { key: 'leads',     label: t('report.leads') },
    { key: 'billing',   label: t('report.billing') },
    { key: 'agents',    label: t('report.agents') },
  ];

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'today',   label: t('reports.today') },
    { key: 'week',    label: t('reports.week') },
    { key: 'month',   label: t('reports.month') },
    { key: 'quarter', label: t('reports.quarter') },
    { key: 'year',    label: t('reports.year') },
    { key: 'custom',  label: t('reports.custom') },
  ];

  const handleDownload = (format: 'pdf' | 'excel') => {
    alert(
      `${format.toUpperCase()} — ${t(`report.${reportType}`)}\n\n` +
      `En producción se generará via /crm/reports/${reportType}?format=${format}&period=${period}`
    );
  };

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">{t('reports.title')}</span>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={() => handleDownload('pdf')}>{t('reports.pdf')}</button>
          <button className="btn btn-primary" onClick={() => handleDownload('excel')}>{t('reports.excel')}</button>
        </div>
      </div>

      <div className="page-content">
        {/* Filtros */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 200px' }}>
              <div className="form-label" style={{ marginBottom: 8 }}>{t('reports.type')}</div>
              <select
                className="filter-select"
                style={{ width: '100%' }}
                value={reportType}
                onChange={e => setReportType(e.target.value as ReportType)}
              >
                {REPORT_TYPES.map(r => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: '2 1 300px' }}>
              <div className="form-label" style={{ marginBottom: 8 }}>{t('reports.period')}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PERIODS.map(p => (
                  <button
                    key={p.key}
                    className={`btn ${period === p.key ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                    onClick={() => setPeriod(p.key)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {period === 'custom' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'flex-end' }}>
                  <div>
                    <div className="form-label" style={{ marginBottom: 4 }}>Desde</div>
                    <input type="date" className="form-input" style={{ padding: '7px 10px', fontSize: '0.82rem' }} defaultValue="2026-05-01" />
                  </div>
                  <div>
                    <div className="form-label" style={{ marginBottom: 4 }}>Hasta</div>
                    <input type="date" className="form-input" style={{ padding: '7px 10px', fontSize: '0.82rem' }} defaultValue="2026-05-13" />
                  </div>
                </div>
              )}
            </div>
            <div style={{ flex: '0 1 180px' }}>
              <div className="form-label" style={{ marginBottom: 8 }}>{t('label.agent')}</div>
              <select className="filter-select" style={{ width: '100%' }}>
                <option>Todos</option>
                <option>Cipriano Castro</option>
                <option>Heidi Raaterova</option>
              </select>
            </div>
            <div style={{ flex: '0 1 180px' }}>
              <div className="form-label" style={{ marginBottom: 8 }}>{t('label.zone')}</div>
              <select className="filter-select" style={{ width: '100%' }}>
                <option>{t('filter.allZones')}</option>
                {ZONES.map(z => <option key={z}>{z}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Panel: Resumen Ejecutivo */}
        {reportType === 'executive' && (
          <div className="report-panel">
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800 }}>Resumen Ejecutivo</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gris)', marginTop: 2 }}>Mayo 2026 · Generado 13/05/2026</div>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.7rem', color: 'var(--gris)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>PulseCosta CRM v1.0</div>
              </div>
              <div className="report-kpi-grid">
                {[
                  { label: 'MRR Total', value: `€${mrr()}`, color: 'var(--verde)', sub: '+€290 vs mes anterior' },
                  { label: 'Cuentas Activas', value: '7', color: 'var(--teal)', sub: '+2 este mes' },
                  { label: 'Leads Activos', value: '28', color: 'var(--naranja)', sub: '+6 esta semana' },
                  { label: 'Conversión Pipeline', value: '32%', color: 'var(--gold)', sub: 'lead → activo' },
                ].map(k => (
                  <div key={k.label} className="report-kpi">
                    <div className="report-kpi-label">{k.label}</div>
                    <div className="report-kpi-value" style={{ color: k.color }}>{k.value}</div>
                    <div className="report-kpi-sub">{k.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid-2">
              <div className="card">
                <div className="card-title">MRR por plan</div>
                {[
                  { plan: 'Hotel Elite', mrr: 429, color: 'var(--gold)', pct: 59 },
                  { plan: 'Hotel Analytics', mrr: 129, color: 'var(--purple)', pct: 18 },
                  { plan: 'Pro BI', mrr: 59, color: 'var(--teal)', pct: 8 },
                  { plan: 'Premium Local', mrr: 87, color: 'var(--naranja)', pct: 12 },
                ].map(p => (
                  <div key={p.plan} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 60px', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{p.plan}</div>
                    <div style={{ height: 8, background: 'rgba(136,146,176,0.15)', borderRadius: 20, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${p.pct}%`, background: p.color, borderRadius: 20 }} />
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', textAlign: 'right', color: p.color }}>€{p.mrr}</div>
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="card-title">Top cuentas · MRR</div>
                {MOCK_ACCOUNTS.filter(a => a.mrr > 0).sort((a, b) => b.mrr - a.mrr).map(a => (
                  <div key={a.id} className="stat-row">
                    <span className="stat-label">{a.name}</span>
                    <span className="stat-val" style={{ color: 'var(--verde)' }}>€{a.mrr}/mes</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Panel: Pipeline */}
        {reportType === 'pipeline' && (
          <div className="card">
            <div className="card-title">Pipeline y Conversión</div>
            <div className="report-kpi-grid">
              {[
                { label: 'Leads totales', value: '28', color: 'var(--naranja)' },
                { label: 'En negociación', value: '2', color: 'var(--gold)' },
                { label: 'Cerrados este mes', value: '3', color: 'var(--verde)' },
                { label: 'Tasa conversión', value: '32%', color: 'var(--teal)' },
              ].map(k => (
                <div key={k.label} className="report-kpi">
                  <div className="report-kpi-label">{k.label}</div>
                  <div className="report-kpi-value" style={{ color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
            <p style={{ color: 'var(--gris)', fontSize: '0.82rem', marginTop: 8 }}>
              Gráfica de embudo de conversión — disponible cuando la API esté conectada.
            </p>
          </div>
        )}

        {/* Panel: Actividad */}
        {reportType === 'activity' && (
          <div className="card">
            <div className="card-title">Actividad Comercial · Mayo 2026</div>
            <div className="report-kpi-grid">
              {[
                { label: 'Llamadas', value: '14', color: 'var(--teal)' },
                { label: 'Emails', value: '22', color: 'var(--naranja)' },
                { label: 'Visitas', value: '6', color: 'var(--verde)' },
                { label: 'Notas', value: '31', color: 'var(--purple)' },
              ].map(k => (
                <div key={k.label} className="report-kpi">
                  <div className="report-kpi-label">{k.label}</div>
                  <div className="report-kpi-value" style={{ color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Panel: Leads */}
        {reportType === 'leads' && (
          <div className="card">
            <div className="card-title">Leads y Prospección · Mayo 2026</div>
            <div className="report-kpi-grid">
              {[
                { label: 'Leads nuevos', value: '12', color: 'var(--naranja)' },
                { label: 'Contactados', value: '8', color: 'var(--teal)' },
                { label: 'Interesados', value: '5', color: 'var(--gold)' },
                { label: 'Convertidos', value: '3', color: 'var(--verde)' },
              ].map(k => (
                <div key={k.label} className="report-kpi">
                  <div className="report-kpi-label">{k.label}</div>
                  <div className="report-kpi-value" style={{ color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Panel: Facturación */}
        {reportType === 'billing' && (
          <div className="card">
            <div className="card-title">Facturación y MRR · Mayo 2026</div>
            <div className="report-kpi-grid">
              {[
                { label: 'MRR actual', value: `€${mrr()}`, color: 'var(--verde)' },
                { label: 'ARR proyectado', value: `€${mrr() * 12}`, color: 'var(--gold)' },
                { label: 'Churn mes', value: '€0', color: 'var(--rojo)' },
                { label: 'Net MRR growth', value: '+€290', color: 'var(--verde)' },
              ].map(k => (
                <div key={k.label} className="report-kpi">
                  <div className="report-kpi-label">{k.label}</div>
                  <div className="report-kpi-value" style={{ color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Panel: Agentes */}
        {reportType === 'agents' && (
          <div className="card">
            <div className="card-title">Rendimiento por Agente · Mayo 2026</div>
            {[
              { name: 'Cipriano Castro', leads: 16, accounts: 5, mrr: 576, calls: 8 },
              { name: 'Heidi Raaterova', leads: 12, accounts: 3, mrr: 158, calls: 6 },
            ].map(ag => (
              <div key={ag.name} style={{ padding: '14px 0', borderBottom: '1px solid rgba(136,146,176,0.08)' }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>{ag.name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  {[
                    { label: 'Leads', value: ag.leads, color: 'var(--naranja)' },
                    { label: 'Cuentas', value: ag.accounts, color: 'var(--verde)' },
                    { label: 'MRR', value: `€${ag.mrr}`, color: 'var(--gold)' },
                    { label: 'Llamadas', value: ag.calls, color: 'var(--teal)' },
                  ].map(k => (
                    <div key={k.label} className="report-kpi">
                      <div className="report-kpi-label">{k.label}</div>
                      <div className="report-kpi-value" style={{ color: k.color, fontSize: '1.2rem' }}>{k.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
