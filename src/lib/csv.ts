import type { Lead, Account } from '../types';

// CSV con separador ';' (Excel ES) + BOM UTF-8. Descarga en el navegador.
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [headers, ...rows].map(r => r.map(esc).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportLeadsCsv(leads: Lead[]) {
  downloadCsv(
    `leads-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Nombre', 'Tipo', 'Zona', 'Fuente', 'Etapa', 'Teléfono', 'Email', 'Agente'],
    leads.map(l => [l.name, l.type, l.zone, l.source, l.stage, l.phone, l.email, l.assigned_to]),
  );
}

export function exportAccountsCsv(accounts: Account[]) {
  downloadCsv(
    `cuentas-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Nombre', 'Tipo', 'Plan', 'Etapa', 'Zona', 'MRR', 'Contacto', 'Teléfono', 'Email', 'Agente'],
    accounts.map(a => [a.name, a.type, a.plan, a.stage, a.zone, a.mrr, a.contact_name, a.contact_phone, a.contact_email, a.assigned_to]),
  );
}
