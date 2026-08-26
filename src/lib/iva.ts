import type { TipoIva, IvaJurisdiccion } from '../types';

export const IVA_RATES_NORMAL = [0, 9, 20, 22] as const;

// ── Jurisdicciones de IVA ──────────────────────────────────────────────
// Novitum OÜ (Estonia) factura a clientes de ES/escandinavia. La jurisdicción
// determina régimen, tasas y nota legal. Se guarda en ops.facturas.iva_jurisdiccion.
export interface IvaJurisdiccionCfg {
  key: IvaJurisdiccion;
  label: string;
  rates: number[];
  defaultRate: number;
  tipoIva: TipoIva;       // régimen almacenado (compat con el CHECK existente)
  reverseCharge: boolean; // requiere VAT del cliente
}

export const IVA_JURISDICCIONES: Record<IvaJurisdiccion, IvaJurisdiccionCfg> = {
  estonia: { key: 'estonia', label: 'Estonia', rates: [0, 9, 22, 24], defaultRate: 24, tipoIva: 'normal',           reverseCharge: false },
  spain:   { key: 'spain',   label: 'España',  rates: [0, 4, 10, 21], defaultRate: 21, tipoIva: 'normal',           reverseCharge: false },
  eu:      { key: 'eu',      label: 'UE',      rates: [0],            defaultRate: 0,  tipoIva: 'intracomunitario', reverseCharge: true  },
  exento:  { key: 'exento',  label: 'Exento',  rates: [0],            defaultRate: 0,  tipoIva: 'exento',           reverseCharge: false },
};

export const IVA_JURISDICCION_ORDER: IvaJurisdiccion[] = ['estonia', 'spain', 'eu', 'exento'];

export function jurisdiccionLabel(j: IvaJurisdiccion): string {
  return IVA_JURISDICCIONES[j]?.label ?? j;
}

// Deriva la jurisdicción de una factura antigua sin el campo (por tipo_iva + tasa).
export function jurisdiccionFromFactura(tipoIva: TipoIva, ivaRate: number): IvaJurisdiccion {
  if (tipoIva === 'intracomunitario') return 'eu';
  if (tipoIva === 'exento') return 'exento';
  return [21, 10, 4].includes(ivaRate) ? 'spain' : 'estonia';
}

export function invoiceLegalNoteJurisdiccion(j: IvaJurisdiccion, rate: number): string | null {
  switch (j) {
    case 'eu':
      return 'Reverse charge – VAT exempt under Art. 44 EU VAT Directive 2006/112/EC. The recipient is liable for VAT declaration and payment in their country.';
    case 'exento':
      return 'VAT exempt under applicable provisions.';
    case 'spain':
      return `IVA español ${rate}% (Ley 37/1992 del IVA).`;
    case 'estonia':
    default:
      return null;
  }
}

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
