// Verifactu (AEAT, RD 1007/2023 + Orden HAC/1177/2024) — BASE, apagada por defecto.
// Solo aplica a facturas con IVA español repercutido (registro en España).
// Spec verificada contra el vector oficial de la AEAT (ver test al final).
//
// NO es cumplimiento activo hasta: alta AEAT + declaración responsable del SIF.
// modo 'no_verifactu' = QR de pruebas; 'verifactu' = envío en tiempo real (no impl.).

const crypto = require('crypto');

const QR_BASE = {
  verifactu: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR', // producción
  pruebas:   'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',               // pre-producción
};

// Valores: mismo contenido del XML, sin espacios al inicio/fin (trim).
function v(x) { return (x === undefined || x === null ? '' : String(x)).trim(); }

/**
 * calcularHuella — huella encadenada del registro de ALTA.
 * Orden EXACTO de campos (Orden HAC/1177/2024, art. 13):
 *   IDEmisorFactura, NumSerieFactura, FechaExpedicionFactura, TipoFactura,
 *   CuotaTotal, ImporteTotal, Huella(anterior), FechaHoraHusoGenRegistro
 * Cadena "campo=valor&...", UTF-8 -> SHA-256 -> hex MAYÚSCULAS (64 chars).
 */
function calcularHuella({ idEmisor, numSerie, fechaExpedicion, tipoFactura, cuotaTotal, importeTotal, huellaAnterior, fechaHoraGen }) {
  const cadena =
    `IDEmisorFactura=${v(idEmisor)}` +
    `&NumSerieFactura=${v(numSerie)}` +
    `&FechaExpedicionFactura=${v(fechaExpedicion)}` +
    `&TipoFactura=${v(tipoFactura)}` +
    `&CuotaTotal=${v(cuotaTotal)}` +
    `&ImporteTotal=${v(importeTotal)}` +
    `&Huella=${v(huellaAnterior)}` +
    `&FechaHoraHusoGenRegistro=${v(fechaHoraGen)}`;
  const huella = crypto.createHash('sha256').update(cadena, 'utf8').digest('hex').toUpperCase();
  return { cadena, huella };
}

/** QR de cotejo AEAT: ?nif=&numserie=&fecha=DD-MM-AAAA&importe=  (URL-encoded). */
function qrUrl({ modo, nif, numSerie, fecha, importe }) {
  const base = modo === 'verifactu' ? QR_BASE.verifactu : QR_BASE.pruebas;
  const params = new URLSearchParams({
    nif: v(nif),
    numserie: v(numSerie),
    fecha: v(fecha),
    importe: v(importe),
  });
  return `${base}?${params.toString()}`;
}

// Fecha ISO local con huso (ej. 2024-01-01T19:20:30+01:00) a partir de un Date.
function fechaHoraHuso(d) {
  const pad = n => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const oh = pad(Math.floor(Math.abs(off) / 60)), om = pad(Math.abs(off) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${oh}:${om}`;
}

module.exports = { calcularHuella, qrUrl, fechaHoraHuso, QR_BASE };
