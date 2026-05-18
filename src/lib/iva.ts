import type { TipoIva } from '../types';

export const IVA_RATES_NORMAL = [0, 9, 20, 22] as const;

export function getDefaultIvaRate(tipo: TipoIva): number {
  return tipo === 'normal' ? 22 : 0;
}

export function calcIva(subtotal: number, rate: number): number {
  return Math.round(subtotal * rate) / 100;
}

export function calcTotal(subtotal: number, ivaImporte: number): number {
  return Math.round((subtotal + ivaImporte) * 100) / 100;
}

export function tipoIvaLabel(tipo: TipoIva): string {
  switch (tipo) {
    case 'normal':           return 'IVA estonio (normal)';
    case 'intracomunitario': return 'Inversión sujeto pasivo (Art. 44)';
    case 'exento':           return 'Exento de IVA';
  }
}

export function invoiceLegalNote(tipo: TipoIva): string | null {
  switch (tipo) {
    case 'intracomunitario':
      return 'Reverse charge – VAT exempt under Art. 44 EU VAT Directive 2006/112/EC. The recipient is liable for VAT declaration and payment in their country.';
    case 'exento':
      return 'VAT exempt under applicable provisions.';
    default:
      return null;
  }
}

export function isOverdue(factura: { estado: string; fecha_vencimiento?: string }): boolean {
  if (factura.estado !== 'sent') return false;
  if (!factura.fecha_vencimiento) return false;
  return new Date(factura.fecha_vencimiento) < new Date(new Date().toDateString());
}

export function daysOverdue(fechaVencimiento: string): number {
  const diff = Date.now() - new Date(fechaVencimiento).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function formatEur(amount: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
