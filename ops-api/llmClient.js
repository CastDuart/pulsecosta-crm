// Cliente LLM abstracto — soporta Ollama (Spark via Tailscale) o Gemini.
//
// Selección por endpoint via env:
//   LLM_HEIDI=ollama    → Ollama para /api/ai/ops/heidi
//   LLM_HEIDI=gemini    → Gemini (default legacy)
//
// Config Ollama:
//   OLLAMA_URL=http://100.126.152.56:11434   (Spark via Tailscale)
//   OLLAMA_MODEL_HEIDI=qwen3:30b-a3b-instruct-2507-q4_K_M
//
// Fallback: si LLM_FALLBACK=gemini y Ollama falla (timeout/red), reintenta con Gemini.

const OLLAMA_URL      = process.env.OLLAMA_URL || 'http://100.126.152.56:11434';
const OLLAMA_TIMEOUT  = parseInt(process.env.OLLAMA_TIMEOUT_MS || '90000');
const FALLBACK_GEMINI = process.env.LLM_FALLBACK === 'gemini';

async function ollamaGenerate(model, prompt) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), OLLAMA_TIMEOUT);
  try {
    const r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
    const data = await r.json();
    return { text: data.response, provider: 'ollama', model, meta: { eval_count: data.eval_count, total_ms: Math.round((data.total_duration||0)/1e6) } };
  } finally {
    clearTimeout(t);
  }
}

async function geminiGenerate(gemini, prompt) {
  const result = await gemini().generateContent(prompt);
  return { text: result.response.text(), provider: 'gemini', model: 'gemini-2.5-flash', meta: {} };
}

/**
 * askLLM({endpoint, prompt, gemini})
 * @param endpoint 'heidi' | 'billing' | 'accountant-report' | ... — para leer LLM_<ENDPOINT> y OLLAMA_MODEL_<ENDPOINT>
 * @param prompt string
 * @param gemini función que devuelve el modelo Gemini (para inyección desde server.js)
 */
async function askLLM({ endpoint, prompt, gemini }) {
  const envKey       = endpoint.toUpperCase().replace(/-/g, '_');
  // Default SEGURO: Ollama local (Spark). Evita mandar PII (clientes/NIF/deudas)
  // a Google por defecto si falta la env. Gemini solo si LLM_<ENDPOINT>=gemini
  // o como fallback explícito (LLM_FALLBACK=gemini).
  const provider     = (process.env[`LLM_${envKey}`] || 'ollama').toLowerCase();
  const ollamaModel  = process.env[`OLLAMA_MODEL_${envKey}`] || 'qwen3:30b-a3b-instruct-2507-q4_K_M';

  if (provider === 'ollama') {
    try {
      return await ollamaGenerate(ollamaModel, prompt);
    } catch (err) {
      console.warn(`[LLM ${endpoint}] Ollama falló: ${err.message}`);
      if (!FALLBACK_GEMINI) throw err;
      console.warn(`[LLM ${endpoint}] Fallback a Gemini`);
      return await geminiGenerate(gemini, prompt);
    }
  }
  return await geminiGenerate(gemini, prompt);
}

module.exports = { askLLM };
