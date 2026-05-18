import ExcelJS from 'exceljs';
import type { Factura, CajaMovimiento, Visita } from '../types';
import { formatDate } from './iva';

async function download(rows: Record<string, unknown>[], name: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Datos');

  if (rows.length === 0) {
    ws.addRow(['Sin datos']);
  } else {
    ws.columns = Object.keys(rows[0]).map(key => ({ header: key, key, width: 20 }));
    ws.getRow(1).font = { bold: true };
    rows.forEach(row => ws.addRow(row));
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportFacturasExcel(facturas: Factura[]) {
  const rows = facturas.map(f => ({
    'Nº Factura':      f.numero,
    'Cliente':         f.cliente_nombre || '',
    'VAT Number':      f.vat_number || '',
    'Fecha emisión':   formatDate(f.fecha_emision),
    'Fecha venc.':     f.fecha_vencimiento ? formatDate(f.fecha_vencimiento) : '',
    'Base imponible':  f.subtotal,
    'IVA %':           f.iva_rate,
    'Importe IVA':     f.iva_importe,
    'Total':           f.total,
    'Estado':          f.estado,
    'Tipo IVA':        f.tipo_iva,
    'Método pago':     f.metodo_pago,
  }));
  return download(rows, `Facturas_${new Date().toISOString().slice(0,10)}`);
}

export function exportCajaExcel(movimientos: CajaMovimiento[]) {
  const rows = movimientos.map(m => ({
    'Fecha':          formatDate(m.fecha),
    'Tipo':           m.tipo === 'income' ? 'Ingreso' : 'Gasto',
    'Categoría':      m.categoria || '',
    'Cliente':        m.cliente_nombre || '',
    'Ref. factura':   m.factura_id ? `FAC-${m.factura_id}` : '',
    'Concepto':       m.concepto,
    'Importe':        m.importe,
    'IVA %':          m.iva_rate,
    'Importe IVA':    m.iva_importe,
  }));
  return download(rows, `Caja_${new Date().toISOString().slice(0,10)}`);
}

export function exportVisitasExcel(visitas: Visita[]) {
  const rows = visitas.map(v => ({
    'Fecha':             formatDate(v.fecha),
    'Empresa/Venue':     v.venue,
    'Ciudad':            v.ciudad || '',
    'Contacto':          v.contacto || '',
    'Teléfono':          v.telefono || '',
    'Email':             v.email || '',
    'Estado':            v.estado,
    'Plan':              v.plan || '',
    'Propuesta enviada': v.propuesta_enviada ? 'Sí' : 'No',
    'Seguimiento':       v.fecha_seguimiento ? formatDate(v.fecha_seguimiento) : '',
    'Próxima acción':    v.proxima_accion || '',
    'Notas':             v.notas || '',
  }));
  return download(rows, `Visitas_${new Date().toISOString().slice(0,10)}`);
}
