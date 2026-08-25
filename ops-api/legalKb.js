// Cliente LegalKB — RAG legal (NOVITUM Legal KB) en Spark, vía Tailscale.
// Solo lectura. El servicio aplica AI Act art.50 (disclaimer) y bloqueo de PII (400).
//
// Contrato:
//   POST /chat  { message, pais?, categoria? }
//     200 -> { response(con disclaimer prefijado), fuentes[], model, ai_disclosure, request_id, latency_ms }
//     400 -> { detail: { error:'pii_detected_in_prompt', detected[], message } }
//
// Alcanzable igual que Ollama: por la IP Tailscale de Spark (100.126.152.56:8769).

const LEGALKB_URL     = process.env.LEGALKB_URL || 'http://100.126.152.56:8769';
const LEGALKB_TIMEOUT = parseInt(process.env.LEGALKB_TIMEOUT_MS || '120000'); // gemma 26b es lento

// ── Detección ligera de intención legal (ES/EN/FI/ET) + categoría/país ──
// Mapeo término -> categoría del KB ('laboral'|'mercantil'|'fiscal'|'software'|'empresa').
const CAT_TERMS = {
  laboral:   ['laboral','despido','contrato de trabajo','empleado','nómina','nomina','convenio','jornada','vacaciones','baja','indemnización','indemnizacion','työ','irtisanominen','tööleping','koondamine','employment','employee','dismiss','fire ','terminate','termination','severance','notice period','labour','labor law','payroll'],
  mercantil: ['mercantil','sociedad','estatutos','junta','administrador','concurso','contrato','cláusula','clausula','arrendamiento','nda','confidencialidad','responsabilidad','liability','shareholder','osaühing','äriseadustik','commercial','company law','terms'],
  fiscal:    ['fiscal','iva','vat','alv','oss','impuesto','tributar','tributación','tributacion','hacienda','declaración','declaracion','intracomunitaria','dividendo','maksu','käibemaks','tax','fiscalidad','retención','retencion'],
  software:  ['licencia','license','software','propiedad intelectual','copyright','marca','trademark','patente','patent','saas','eula','open source','gdpr','rgpd','datos personales','privacidad','privacy','ai act','tekijänoikeus','litsents'],
  empresa:   ['normativa','cumplimiento','compliance','sanción','sancion','regulación','regulacion','ley','legal','jurídico','juridico','reglamento','directiva','seadus','õigus','laki','regulation','statute'],
};
const PAIS_TERMS = {
  estonia: ['estonia','estonio','oü','ou','registrikood','maksu','äri','tallinn','eesti'],
  spain:   ['españa','espana','español','espanol','aeat','hacienda','seguridad social','autónomo','autonomo','irpf'],
  finland: ['finlandia','finland','finlandés','finlandes','suomi','alv','vero','helsinki'],
};

function detectLegal(text) {
  const s = (text || '').toLowerCase();
  let categoria = null, hits = 0;
  for (const [cat, terms] of Object.entries(CAT_TERMS)) {
    const c = terms.reduce((n, t) => n + (s.includes(t) ? 1 : 0), 0);
    if (c > 0) { hits += c; if (categoria === null) categoria = cat; }
  }
  let pais = null;
  for (const [p, terms] of Object.entries(PAIS_TERMS)) {
    if (terms.some(t => s.includes(t))) { pais = p; break; }
  }
  return { isLegal: hits > 0, categoria, pais };
}

// ── Llamada al RAG legal ──
async function askLegalKB({ message, pais, categoria }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), LEGALKB_TIMEOUT);
  try {
    const r = await fetch(`${LEGALKB_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, pais: pais || null, categoria: categoria || null }),
      signal: ctrl.signal,
    });
    if (r.status === 400) {
      const body = await r.json().catch(() => ({}));
      const detail = body.detail || body;
      return { blocked: true, detected: detail.detected || [], message: detail.message || 'Consulta con datos personales; reformúlala sin ellos.' };
    }
    if (!r.ok) throw new Error(`LegalKB HTTP ${r.status}`);
    const data = await r.json();
    return {
      blocked: false,
      // El servicio devuelve 200 con model:'fallback' cuando su RAG está caído
      // (p.ej. disco de datos offline). Lo tratamos como degradado: no inyectar.
      degraded: data.model === 'fallback',
      response: data.response,
      fuentes: data.fuentes || [],
      disclaimer: data.ai_disclosure,
      model: data.model,
      request_id: data.request_id,
      latency_ms: data.latency_ms,
      service_version: data.service_version,
    };
  } finally {
    clearTimeout(t);
  }
}

module.exports = { askLegalKB, detectLegal, LEGALKB_URL };
