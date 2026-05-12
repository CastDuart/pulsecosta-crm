import { createContext, useContext, useState, type ReactNode } from 'react';

export type Lang = 'es' | 'en';

const T: Record<Lang, Record<string, string>> = {
  es: {
    'sec.main': 'Principal', 'sec.prospecting': 'Prospección',
    'sec.ops': 'Operativa', 'sec.analytics': 'Análisis',
    'nav.dashboard': 'Dashboard', 'nav.pipeline': 'Pipeline',
    'nav.leads': 'Leads', 'nav.accounts': 'Cuentas',
    'nav.tasks': 'Tareas', 'nav.activities': 'Actividades', 'nav.reports': 'Informes',
    'btn.newLead': '+ Nuevo Lead', 'btn.newAccount': '+ Nueva Cuenta',
    'btn.export': 'Exportar CSV', 'btn.signin': 'Entrar',
    'btn.save': 'Guardar', 'btn.cancel': 'Cancelar',
    'filter.allZones': 'Todas las zonas', 'filter.allPlans': 'Todos los planes',
    'filter.allSources': 'Todas las fuentes', 'filter.allStatuses': 'Todos los estados',
    'filter.allAgents': 'Todos los agentes',
    'label.zone': 'Zona', 'label.plan': 'Plan', 'label.stage': 'Etapa',
    'label.agent': 'Agente', 'label.date': 'Fecha', 'label.status': 'Estado',
    'label.priority': 'Prioridad', 'label.name': 'Nombre', 'label.type': 'Tipo',
    'label.source': 'Fuente', 'label.mrr': 'MRR', 'label.contact': 'Contacto',
    'label.notes': 'Notas',
    'dash.activeLeads': 'Leads activos', 'dash.activeAccounts': 'Cuentas activas',
    'dash.mrr': 'MRR estimado', 'dash.overdue': 'Tareas vencidas',
    'dash.recentActivity': 'Actividad reciente', 'dash.priorityTasks': 'Tareas prioritarias',
    'dash.topPipeline': 'Top Pipeline',
    'common.seeAll': 'Ver todo →', 'common.today': 'Hoy',
    'common.thisWeek': 'Esta semana', 'common.thisMonth': 'Este mes',
    'common.search': 'Buscar...', 'common.loading': 'Cargando...',
    'stage.new': 'Nuevo', 'stage.attempting_contact': 'Contactando',
    'stage.contacted': 'Contactado', 'stage.interested': 'Interesado',
    'stage.demo_scheduled': 'Demo agendada', 'stage.proposal_sent': 'Propuesta enviada',
    'stage.negotiation': 'Negociación', 'stage.onboarding_pending': 'Onboarding',
    'stage.payment_pending': 'Pago pendiente', 'stage.active': 'Activo',
    'stage.at_risk': 'En riesgo', 'stage.churned': 'Churned', 'stage.lost': 'Perdido',
    'plan.premium_local': 'Premium Local', 'plan.pro_bi': 'Pro BI',
    'plan.hotel_analytics': 'Hotel Analytics', 'plan.hotel_elite': 'Hotel Elite',
    'priority.urgent': 'Urgente', 'priority.high': 'Alta',
    'priority.medium': 'Media', 'priority.low': 'Baja',
    'activity.call': 'Llamada', 'activity.email': 'Email',
    'activity.visit': 'Visita', 'activity.note': 'Nota', 'activity.system': 'Sistema',
    'reports.title': 'Informes', 'reports.download': 'Descargar',
    'reports.type': 'Tipo de informe', 'reports.period': 'Período',
    'reports.today': 'Hoy', 'reports.week': 'Esta semana',
    'reports.month': 'Este mes', 'reports.quarter': 'Trimestre',
    'reports.year': 'Este año', 'reports.custom': '📅 Personalizado',
    'reports.pdf': '⬇ PDF', 'reports.excel': '⬇ Excel',
    'report.executive': '📋 Resumen ejecutivo', 'report.pipeline': '⬡ Pipeline y conversión',
    'report.activity': '↺ Actividad comercial', 'report.leads': '◎ Leads y prospección',
    'report.billing': '€ Facturación y MRR', 'report.agents': '👤 Rendimiento por agente',
    'lead.new': 'Nuevo Lead', 'lead.name': 'Nombre del local / hotel',
    'lead.phone': 'Teléfono de contacto',
  },
  en: {
    'sec.main': 'Main', 'sec.prospecting': 'Prospecting',
    'sec.ops': 'Operations', 'sec.analytics': 'Analytics',
    'nav.dashboard': 'Dashboard', 'nav.pipeline': 'Pipeline',
    'nav.leads': 'Leads', 'nav.accounts': 'Accounts',
    'nav.tasks': 'Tasks', 'nav.activities': 'Activity', 'nav.reports': 'Reports',
    'btn.newLead': '+ New Lead', 'btn.newAccount': '+ New Account',
    'btn.export': 'Export CSV', 'btn.signin': 'Sign In',
    'btn.save': 'Save', 'btn.cancel': 'Cancel',
    'filter.allZones': 'All zones', 'filter.allPlans': 'All plans',
    'filter.allSources': 'All sources', 'filter.allStatuses': 'All statuses',
    'filter.allAgents': 'All agents',
    'label.zone': 'Zone', 'label.plan': 'Plan', 'label.stage': 'Stage',
    'label.agent': 'Agent', 'label.date': 'Date', 'label.status': 'Status',
    'label.priority': 'Priority', 'label.name': 'Name', 'label.type': 'Type',
    'label.source': 'Source', 'label.mrr': 'MRR', 'label.contact': 'Contact',
    'label.notes': 'Notes',
    'dash.activeLeads': 'Active Leads', 'dash.activeAccounts': 'Active Accounts',
    'dash.mrr': 'Estimated MRR', 'dash.overdue': 'Overdue Tasks',
    'dash.recentActivity': 'Recent Activity', 'dash.priorityTasks': 'Priority Tasks',
    'dash.topPipeline': 'Top Pipeline',
    'common.seeAll': 'See all →', 'common.today': 'Today',
    'common.thisWeek': 'This week', 'common.thisMonth': 'This month',
    'common.search': 'Search...', 'common.loading': 'Loading...',
    'stage.new': 'New', 'stage.attempting_contact': 'Attempting contact',
    'stage.contacted': 'Contacted', 'stage.interested': 'Interested',
    'stage.demo_scheduled': 'Demo scheduled', 'stage.proposal_sent': 'Proposal sent',
    'stage.negotiation': 'Negotiation', 'stage.onboarding_pending': 'Onboarding',
    'stage.payment_pending': 'Payment pending', 'stage.active': 'Active',
    'stage.at_risk': 'At risk', 'stage.churned': 'Churned', 'stage.lost': 'Lost',
    'plan.premium_local': 'Premium Local', 'plan.pro_bi': 'Pro BI',
    'plan.hotel_analytics': 'Hotel Analytics', 'plan.hotel_elite': 'Hotel Elite',
    'priority.urgent': 'Urgent', 'priority.high': 'High',
    'priority.medium': 'Medium', 'priority.low': 'Low',
    'activity.call': 'Call', 'activity.email': 'Email',
    'activity.visit': 'Visit', 'activity.note': 'Note', 'activity.system': 'System',
    'reports.title': 'Reports', 'reports.download': 'Download',
    'reports.type': 'Report type', 'reports.period': 'Period',
    'reports.today': 'Today', 'reports.week': 'This week',
    'reports.month': 'This month', 'reports.quarter': 'Quarter',
    'reports.year': 'This year', 'reports.custom': '📅 Custom',
    'reports.pdf': '⬇ PDF', 'reports.excel': '⬇ Excel',
    'report.executive': '📋 Executive summary', 'report.pipeline': '⬡ Pipeline & conversion',
    'report.activity': '↺ Commercial activity', 'report.leads': '◎ Leads & prospecting',
    'report.billing': '€ Billing & MRR', 'report.agents': '👤 Agent performance',
    'lead.new': 'New Lead', 'lead.name': 'Venue / hotel name',
    'lead.phone': 'Contact phone',
  },
};

interface LangContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const LangContext = createContext<LangContextType | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(
    () => (localStorage.getItem('crm_lang') as Lang) ?? 'es'
  );

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem('crm_lang', l);
  };

  const t = (key: string): string => T[lang][key] ?? T.es[key] ?? key;

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used within LangProvider');
  return ctx;
}
