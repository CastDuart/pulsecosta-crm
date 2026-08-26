import { useState, useEffect, useMemo } from 'react';
import { useLang } from '../context/LangContext';
import { apiFetch } from '../lib/api';
import type { Account, Lead, Activity } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';

type ReportType = 'executive' | 'pipeline' | 'activity' | 'leads' | 'billing' | 'agents';
type Period = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all';

type ReportSection = { title: string; headers: string[]; rows: (string | number)[][] };
type ReportData = { title: string; subtitle: string; kpis: { label: string; value: string }[]; sections: ReportSection[] };

const calcMrr = (accounts: Account[]) => accounts.filter(a => a.stage === 'active').reduce((s, a) => s + (a.mrr || 0), 0);
const eur = (n: number) => `€${Math.round(n).toLocaleString('es-ES')}`;

// Rango [start, now] según el periodo. 'all' = sin límite.
function periodStart(period: Period): Date | null {
  const now = new Date();
  const d = new Date(now);
  switch (period) {
    case 'today':   d.setHours(0, 0, 0, 0); return d;
    case 'week':    d.setDate(now.getDate() - 7); return d;
    case 'month':   d.setMonth(now.getMonth() - 1); return d;
    case 'quarter': d.setMonth(now.getMonth() - 3); return d;
    case 'year':    d.setFullYear(now.getFullYear() - 1); return d;
    default:        return null;
  }
}

function groupCount<T>(items: T[], key: (t: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const it of items) { const k = key(it) || '—'; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export default function Reports() {
  const { t } = useLang();
  const [reportType, setReportType] = useState<ReportType>('executive');
  const [period, setPeriod] = useState<Period>('month');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<Account[]>('/crm/accounts').catch(() => []),
      apiFetch<Lead[]>('/crm/leads').catch(() => []),
      apiFetch<Activity[]>('/crm/activities').catch(() => []),
    ]).then(([a, l, ac]) => { setAccounts(a); setLeads(l); setActivities(ac); }).finally(() => setLoading(false));
  }, []);

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
    { key: 'all',     label: 'Todo' },
  ];

  const report: ReportData = useMemo(() => {
    const start = periodStart(period);
    const inP = (dateStr?: string) => !start || (dateStr ? new Date(dateStr) >= start : false);
    const periodLabel = PERIODS.find(p => p.key === period)?.label ?? '';

    // Conjuntos filtrados por periodo (creación)
    const leadsP = leads.filter(l => inP(l.created_at));
    const actsP  = activities.filter(a => inP(a.created_at));

    const mrr = calcMrr(accounts);
    const activeAccts = accounts.filter(a => a.stage === 'active').length;
    const closedStages = ['active', 'onboarding_pending', 'payment_pending'];
    const converted = leads.filter(l => closedStages.includes(l.stage)).length;
    const totalPipe = leads.length + accounts.length;
    const convRate = totalPipe > 0 ? Math.round((accounts.length / totalPipe) * 100) : 0;

    switch (reportType) {
      case 'executive': {
        const byPlan = new Map<string, { count: number; mrr: number }>();
        accounts.filter(a => a.stage === 'active').forEach(a => {
          const cur = byPlan.get(a.plan) || { count: 0, mrr: 0 };
          byPlan.set(a.plan, { count: cur.count + 1, mrr: cur.mrr + (a.mrr || 0) });
        });
        return {
          title: 'Resumen ejecutivo', subtitle: periodLabel,
          kpis: [
            { label: 'MRR total', value: eur(mrr) },
            { label: 'Cuentas activas', value: String(activeAccts) },
            { label: 'Leads activos', value: String(leads.length) },
            { label: 'Conversión pipeline', value: `${convRate}%` },
          ],
          sections: [
            { title: 'MRR por plan', headers: ['Plan', 'Cuentas', 'MRR'],
              rows: [...byPlan.entries()].map(([p, v]) => [t(`plan.${p}` as Parameters<typeof t>[0]) || p, v.count, eur(v.mrr)]) },
            { title: 'Top cuentas · MRR', headers: ['Cuenta', 'Plan', 'MRR/mes'],
              rows: accounts.filter(a => a.mrr > 0).sort((a, b) => b.mrr - a.mrr).slice(0, 10)
                .map(a => [a.name, t(`plan.${a.plan}` as Parameters<typeof t>[0]) || a.plan, eur(a.mrr)]) },
          ],
        };
      }
      case 'pipeline': {
        const neg = leads.filter(l => l.stage === 'negotiation').length;
        const interested = leads.filter(l => l.stage === 'interested').length;
        return {
          title: 'Pipeline y conversión', subtitle: periodLabel,
          kpis: [
            { label: 'Leads totales', value: String(leads.length) },
            { label: 'En negociación', value: String(neg) },
            { label: 'Interesados', value: String(interested) },
            { label: 'Conversión', value: `${convRate}%` },
          ],
          sections: [
            { title: 'Leads por etapa', headers: ['Etapa', 'Nº'],
              rows: groupCount(leads, l => t(`stage.${l.stage}` as Parameters<typeof t>[0]) || l.stage) },
          ],
        };
      }
      case 'activity': {
        const byType = (ty: string) => actsP.filter(a => a.type === ty).length;
        return {
          title: 'Actividad comercial', subtitle: periodLabel,
          kpis: [
            { label: t('activity.call'),  value: String(byType('call')) },
            { label: t('activity.email'), value: String(byType('email')) },
            { label: t('activity.visit'), value: String(byType('visit')) },
            { label: t('activity.note'),  value: String(byType('note')) },
          ],
          sections: [
            { title: 'Actividad por agente', headers: ['Agente', 'Actividades'],
              rows: groupCount(actsP, a => a.agent) },
          ],
        };
      }
      case 'leads': {
        return {
          title: 'Leads y prospección', subtitle: periodLabel,
          kpis: [
            { label: 'Leads nuevos', value: String(leadsP.length) },
            { label: 'Contactados', value: String(leads.filter(l => l.stage === 'contacted').length) },
            { label: 'Interesados', value: String(leads.filter(l => l.stage === 'interested').length) },
            { label: 'Convertidos', value: String(converted) },
          ],
          sections: [
            { title: 'Leads por fuente', headers: ['Fuente', 'Nº'], rows: groupCount(leads, l => l.source) },
            { title: 'Leads por zona', headers: ['Zona', 'Nº'], rows: groupCount(leads, l => l.zone) },
          ],
        };
      }
      case 'billing': {
        const churn = accounts.filter(a => a.stage === 'churned').reduce((s, a) => s + (a.mrr || 0), 0);
        return {
          title: 'Facturación y MRR', subtitle: periodLabel,
          kpis: [
            { label: 'MRR actual', value: eur(mrr) },
            { label: 'ARR proyectado', value: eur(mrr * 12) },
            { label: 'Cuentas activas', value: String(activeAccts) },
            { label: 'Churn (MRR)', value: eur(churn) },
          ],
          sections: [
            { title: 'MRR por cuenta', headers: ['Cuenta', 'MRR/mes', 'ARR'],
              rows: accounts.filter(a => a.mrr > 0).sort((a, b) => b.mrr - a.mrr)
                .map(a => [a.name, eur(a.mrr), eur(a.mrr * 12)]) },
          ],
        };
      }
      case 'agents':
      default: {
        const names = [...new Set([...accounts.map(a => a.assigned_to), ...leads.map(l => l.assigned_to), ...activities.map(a => a.agent)].filter(Boolean))];
        return {
          title: 'Rendimiento por agente', subtitle: periodLabel,
          kpis: [
            { label: 'Agentes', value: String(names.length) },
            { label: 'Cuentas', value: String(accounts.length) },
            { label: 'Leads', value: String(leads.length) },
            { label: 'Actividades', value: String(actsP.length) },
          ],
          sections: [
            { title: 'Rendimiento por agente', headers: ['Agente', 'Leads', 'Cuentas', 'MRR', 'Activ.'],
              rows: names.map(n => [
                n,
                leads.filter(l => l.assigned_to === n).length,
                accounts.filter(a => a.assigned_to === n).length,
                eur(accounts.filter(a => a.assigned_to === n && a.stage === 'active').reduce((s, a) => s + (a.mrr || 0), 0)),
                actsP.filter(a => a.agent === n).length,
              ]) },
          ],
        };
      }
    }
  }, [reportType, period, accounts, leads, activities, t]);

  const stamp = () => new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

  function exportPdf() {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text(`PulseCosta — ${report.title}`, 14, 18);
    doc.setFontSize(10); doc.setTextColor(120);
    doc.text(`${report.subtitle} · Generado ${stamp()}`, 14, 25);
    let y = 34;
    doc.setTextColor(20); doc.setFontSize(11);
    report.kpis.forEach((k, i) => { doc.text(`${k.label}: ${k.value}`, 14 + (i % 2) * 95, y + Math.floor(i / 2) * 7); });
    y += Math.ceil(report.kpis.length / 2) * 7 + 6;
    report.sections.forEach(sec => {
      doc.setFontSize(11); doc.setTextColor(20); doc.text(sec.title, 14, y);
      autoTable(doc, {
        startY: y + 3,
        head: [sec.headers],
        body: sec.rows.length ? sec.rows.map(r => r.map(String)) : [['Sin datos', ...Array(sec.headers.length - 1).fill('')]],
        styles: { fontSize: 9 }, headStyles: { fillColor: [15, 46, 56] },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    });
    doc.save(`informe-${reportType}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  async function exportExcel() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(report.title.slice(0, 28));
    ws.addRow([`PulseCosta — ${report.title}`]);
    ws.addRow([`${report.subtitle} · Generado ${stamp()}`]);
    ws.addRow([]);
    ws.addRow(['Indicador', 'Valor']);
    report.kpis.forEach(k => ws.addRow([k.label, k.value]));
    report.sections.forEach(sec => {
      ws.addRow([]); ws.addRow([sec.title]); ws.addRow(sec.headers);
      if (sec.rows.length) sec.rows.forEach(r => ws.addRow(r)); else ws.addRow(['Sin datos']);
    });
    ws.columns.forEach(c => { c.width = 22; });
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = `informe-${reportType}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">{t('reports.title')}</span>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={exportPdf}>{t('reports.pdf')}</button>
          <button className="btn btn-primary" onClick={exportExcel}>{t('reports.excel')}</button>
        </div>
      </div>

      <div className="page-content">
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 200px' }}>
              <div className="form-label" style={{ marginBottom: 8 }}>{t('reports.type')}</div>
              <select className="filter-select" style={{ width: '100%' }} value={reportType} onChange={e => setReportType(e.target.value as ReportType)}>
                {REPORT_TYPES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
            <div style={{ flex: '2 1 300px' }}>
              <div className="form-label" style={{ marginBottom: 8 }}>{t('reports.period')}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PERIODS.map(p => (
                  <button key={p.key} className={`btn ${period === p.key ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ fontSize: '0.75rem', padding: '6px 10px' }} onClick={() => setPeriod(p.key)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="report-panel">
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800 }}>{report.title}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted-tint)', marginTop: 2 }}>
                  {report.subtitle} · {loading ? 'Cargando…' : `Generado ${stamp()}`}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.7rem', color: 'var(--muted-tint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>PulseCosta CRM</div>
            </div>
            <div className="report-kpi-grid">
              {report.kpis.map(k => (
                <div key={k.label} className="report-kpi">
                  <div className="report-kpi-label">{k.label}</div>
                  <div className="report-kpi-value">{k.value}</div>
                </div>
              ))}
            </div>
          </div>

          {report.sections.map(sec => (
            <div key={sec.title} className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">{sec.title}</div>
              <div className="table-wrap">
                <table>
                  <thead><tr>{sec.headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {sec.rows.length === 0 ? (
                      <tr><td colSpan={sec.headers.length} style={{ textAlign: 'center', color: 'var(--gris)', padding: '18px 0' }}>Sin datos en este periodo</td></tr>
                    ) : sec.rows.map((r, i) => (
                      <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
