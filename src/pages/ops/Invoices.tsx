import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../lib/opsFetch';
import type { Factura, FacturaLinea, Cliente, TipoIva, IvaJurisdiccion, EstadoFactura, TipoFactura } from '../../types';
import {
  formatEur, formatDate, isOverdue,
  calcIva, calcTotal,
  IVA_JURISDICCIONES, IVA_JURISDICCION_ORDER, invoiceLegalNoteJurisdiccion, jurisdiccionFromFactura,
} from '../../lib/iva';
import { exportFacturasExcel } from '../../lib/excel';
import { generateInvoicePDF } from '../../lib/pdf';
import { Plus, X, Download, Printer, ChevronRight, Trash2 } from 'lucide-react';
import ChipSelect from '../../components/ui/ChipSelect';
import QRCode from 'qrcode';
import { useLang } from '../../context/LangContext';

const ESTADO_KEY: Record<string, string> = {
  borrador: 'invoice.status.draft',
  enviada: 'invoice.status.sent',
  cobrada: 'invoice.status.paid',
  vencida: 'invoice.status.overdue',
  anulada: 'invoice.status.cancelled',
};

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const { t } = useLang();
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
      <div style={{ background:'var(--ivory-alt)',borderRadius:16,padding:32,width:'100%',maxWidth:wide?760:560,border:'1px solid var(--linea)',maxHeight:'92vh',overflowY:'auto' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24 }}>
          <h2 style={{ margin:0,fontSize:18,fontWeight:700,color:'var(--ink)' }}>{title}</h2>
          <button aria-label={t('common.close')} onClick={onClose} style={{ background:'none',border:'none',color:'var(--muted)',cursor:'pointer' }}><X size={20}/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, span2 }: { label: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div style={{ marginBottom:12, ...(span2 ? { gridColumn:'span 2' } : {}) }}>
      <label style={{ fontSize:12,color:'var(--muted)',display:'block',marginBottom:5 }}>{label}</label>
      {children}
    </div>
  );
}

function StatusBadge({ estado }: { estado: string }) {
  const { t } = useLang();
  const m: Record<string, [string,string]> = {
    borrador:['rgba(15,46,56,0.15)','var(--muted-tint)'],
    enviada:['rgba(23,129,127,0.15)','var(--teal-tint)'],
    cobrada:['rgba(23,129,127,0.15)','var(--teal-tint)'],
    vencida:['rgba(229,72,77,0.15)','var(--rojo-tint)'],
    anulada:['rgba(15,46,56,0.15)','var(--muted-tint)'],
  };
  const [bg,color] = m[estado] || m.borrador;
  return <span style={{ background:bg,color,borderRadius:20,padding:'3px 10px',fontSize:11,fontWeight:600 }}>{t(ESTADO_KEY[estado] ?? estado)}</span>;
}

function ivaTypeLabel(t: (key: string, vars?: Record<string, string | number>) => string, tipo: TipoIva, rate?: number) {
  if (tipo === 'normal') return rate === undefined ? t('invoice.vat.normal') : t('invoice.vat.normalRate', { rate });
  if (tipo === 'intracomunitario') return t('invoice.vat.reverseShort');
  return t('invoice.vat.exempt');
}

function jurisdictionLabelT(t: (key: string) => string, j: IvaJurisdiccion) {
  return t(`invoice.jurisdiction.${j}`);
}

type NewLine = Omit<FacturaLinea, 'id' | 'factura_id' | 'orden'>;

function InvoiceForm({ clientes, onSave, onClose, preClienteId }: {
  clientes: Cliente[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
  preClienteId?: number;
}) {
  const { t } = useLang();
  const today = new Date().toISOString().split('T')[0];
  const due30 = new Date(Date.now() + 30*864e5).toISOString().split('T')[0];

  const [nextNum, setNextNum] = useState('...');
  const [clienteId, setClienteId]     = useState<string>(preClienteId?.toString() || '');
  const [fechaEmision, setFechaEmision] = useState(today);
  const [fechaVenc, setFechaVenc]       = useState(due30);
  const [metodoPago, setMetodoPago]     = useState('bank_transfer');
  const [jurisdiccion, setJurisdiccion] = useState<IvaJurisdiccion>('estonia');
  const [ivaRate, setIvaRate]           = useState(24);
  const tipoIva: TipoIva = IVA_JURISDICCIONES[jurisdiccion].tipoIva;   // régimen derivado
  const jCfg = IVA_JURISDICCIONES[jurisdiccion];
  const [tipo, setTipo]                 = useState<TipoFactura>('normal');
  const [intervalo, setIntervalo]       = useState('mensual');
  const [notas, setNotas]               = useState('');
  const [lineas, setLineas]             = useState<NewLine[]>([{ descripcion:'', cantidad:1, precio_unitario:0, importe:0 }]);
  const [saving, setSaving]             = useState(false);
  const [err, setErr]                   = useState('');

  useEffect(() => {
    apiFetch<{ numero: string }>('/ops/facturas/next-number').then(r => setNextNum(r.numero));
  }, []);

  // Al cambiar jurisdicción, ajusta la tasa a su default (24 EE / 21 ES / 0 UE / 0 exento).
  useEffect(() => {
    setIvaRate(IVA_JURISDICCIONES[jurisdiccion].defaultRate);
  }, [jurisdiccion]);

  const cliente = clientes.find(c => c.id === Number(clienteId));
  // Al elegir cliente, la jurisdicción de IVA sale de su país (ES → España 21 %, EE → Estonia, resto UE → intracomunitario, fuera UE → exento).
  useEffect(() => {
    if (!cliente?.pais) return;
    const p = cliente.pais.trim().toUpperCase();
    const UE = ['AT','BE','BG','HR','CY','CZ','DK','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','SE'];
    const next: IvaJurisdiccion = p === 'ES' || p === 'ESPAÑA' || p === 'SPAIN' ? 'spain' : p === 'EE' || p === 'ESTONIA' ? 'estonia' : UE.includes(p) ? 'eu' : 'exento';
    setJurisdiccion(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente?.id]);

  const subtotal = lineas.reduce((s, l) => s + l.importe, 0);
  const ivaImporte = calcIva(subtotal, ivaRate);
  const total = calcTotal(subtotal, ivaImporte);
  const legalNote = invoiceLegalNoteJurisdiccion(jurisdiccion, ivaRate);

  function setLinea(i: number, k: keyof NewLine, v: string | number) {
    setLineas(prev => {
      const n = [...prev];
      n[i] = { ...n[i], [k]: v };
      if (k === 'cantidad' || k === 'precio_unitario') {
        n[i].importe = Math.round(n[i].cantidad * n[i].precio_unitario * 100) / 100;
      }
      return n;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clienteId) { setErr(t('invoice.error.selectClient')); return; }
    setSaving(true); setErr('');
    try {
      await onSave({
        cliente_id: Number(clienteId),
        fecha_emision: fechaEmision,
        fecha_vencimiento: fechaVenc || null,
        metodo_pago: metodoPago,
        tipo_iva: tipoIva,
        iva_jurisdiccion: jurisdiccion,
        iva_rate: ivaRate,
        subtotal,
        iva_importe: ivaImporte,
        total,
        tipo,
        intervalo_recurrencia: tipo === 'recurrente' ? intervalo : null,
        notas: notas || null,
        lineas: lineas.filter(l => l.descripcion.trim()),
      });
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : t('common.saveError')); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit}>
      {/* Vista previa del número de factura */}
      <div style={{ background:'rgba(255,122,26,0.08)',border:'1px solid rgba(255,122,26,0.2)',borderRadius:8,padding:'10px 16px',marginBottom:20,display:'flex',justifyContent:'space-between' }}>
        <span style={{ fontSize:13,color:'var(--muted-tint)' }}>{t('invoice.number')}</span>
        <span style={{ fontFamily:'JetBrains Mono, monospace',fontWeight:700,color:'var(--naranja-tint)',fontSize:15 }}>{nextNum}</span>
      </div>

      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',gap:10 }}>
        <Field label={`${t('ops.clientName')} *`} span2>
          <ChipSelect
            value={clienteId}
            onChange={setClienteId}
            options={clientes.map(c => ({ value: String(c.id), label: `${c.nombre}${c.vat_number ? ` (${c.vat_number})` : ''}` }))}
            allowEmpty
            emptyLabel={t('invoice.selectClient')}
            searchPlaceholder={t('invoice.searchClient')}
          />
        </Field>

        <Field label={t('invoice.issueDate')}><input type="date" aria-label={t('invoice.issueDate')} value={fechaEmision} onChange={e => setFechaEmision(e.target.value)} /></Field>
        <Field label={t('invoice.dueDate')}><input type="date" aria-label={t('invoice.dueDate')} value={fechaVenc} onChange={e => setFechaVenc(e.target.value)} /></Field>
        <Field label={t('invoice.paymentMethod')}>
          <ChipSelect
            value={metodoPago}
            onChange={setMetodoPago}
            options={[
              { value: 'bank_transfer', label: t('invoice.payment.bankTransfer') },
              { value: 'sepa', label: 'SEPA' },
              { value: 'stripe', label: 'Stripe' },
              { value: 'revolut', label: 'Revolut' },
              { value: 'cash', label: t('invoice.payment.cash') },
            ]}
          />
        </Field>
        <Field label={t('label.type')}>
          <ChipSelect
            value={tipo}
            onChange={v => setTipo(v as TipoFactura)}
            options={[{ value: 'normal', label: t('invoice.type.normal') }, { value: 'recurrente', label: t('invoice.type.recurring') }]}
          />
        </Field>
        {tipo === 'recurrente' && (
          <Field label={t('invoice.interval')}>
            <ChipSelect
              value={intervalo}
              onChange={setIntervalo}
              options={[{ value: 'mensual', label: t('invoice.interval.monthly') }, { value: 'trimestral', label: t('invoice.interval.quarterly') }]}
            />
          </Field>
        )}

        {/* Jurisdicción de IVA — determina régimen, tasas y nota legal */}
        <Field label={t('invoice.vatJurisdiction')} span2>
          <ChipSelect
            value={jurisdiccion}
            onChange={v => setJurisdiccion(v as IvaJurisdiccion)}
            options={IVA_JURISDICCION_ORDER.map(j => ({ value: j, label: jurisdictionLabelT(t, j) }))}
          />
        </Field>

        {/* Aviso inversión del sujeto pasivo (UE) */}
        {jCfg.reverseCharge && (
          <div style={{ gridColumn:'span 2',background:'rgba(255,122,26,0.08)',border:'1px solid rgba(255,122,26,0.25)',borderRadius:8,padding:'10px 14px',fontSize:12,color:'var(--naranja-tint)' }}>
            <strong>{t('invoice.reverseTitle')}:</strong> {t('invoice.reverseHelp')}
            {cliente && !cliente.vat_number && (
              <div style={{ marginTop:4,color:'var(--rojo-text)' }}>{t('invoice.missingVatWarning')}</div>
            )}
          </div>
        )}

        {jCfg.rates.length > 1 && (
          <Field label={t('invoice.vatRateFor', { jurisdiction: jurisdictionLabelT(t, jurisdiccion) })}>
            <ChipSelect
              value={String(ivaRate)}
              onChange={v => setIvaRate(Number(v))}
              options={jCfg.rates.map(r => ({ value: String(r), label: `${r}%` }))}
            />
          </Field>
        )}
      </div>

      {/* Líneas */}
      <div style={{ margin:'16px 0 8px',fontSize:13,fontWeight:700,color:'var(--naranja-text)',borderBottom:'1px solid var(--linea)',paddingBottom:8 }}>{t('invoice.lines')}</div>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--linea)' }}>
              {[t('invoice.description'),t('invoice.qty'),t('invoice.unitPrice'),t('invoice.amount'),''].map(h => (
                <th key={h} style={{ textAlign:'left',padding:'6px 8px',color:'var(--muted)',fontWeight:500,fontSize:11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i}>
                <td style={{ padding:'4px 6px' }}>
                  <input value={l.descripcion} aria-label={t('invoice.serviceDescription')} onChange={e => setLinea(i,'descripcion',e.target.value)} placeholder={t('invoice.serviceDescription')} />
                </td>
                <td style={{ padding:'4px 6px',width:60 }}>
                  <input type="number" aria-label={t('invoice.qty')} value={l.cantidad} min={0} onChange={e => setLinea(i,'cantidad',Number(e.target.value))} style={{ width:60 }} />
                </td>
                <td style={{ padding:'4px 6px',width:100 }}>
                  <input type="number" aria-label={t('invoice.unitPrice')} value={l.precio_unitario} min={0} step={0.01} onChange={e => setLinea(i,'precio_unitario',Number(e.target.value))} style={{ width:100 }} />
                </td>
                <td style={{ padding:'4px 6px',width:90,fontFamily:'JetBrains Mono, monospace',color:'var(--ink)',textAlign:'right' }}>
                  {formatEur(l.importe)}
                </td>
                <td style={{ padding:'4px 6px',width:30 }}>
                  {lineas.length > 1 && (
                    <button type="button" onClick={() => setLineas(p => p.filter((_,j) => j !== i))} style={{ background:'none',border:'none',color:'var(--rojo-text)',cursor:'pointer',padding:2 }}>
                      <Trash2 size={14}/>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => setLineas(p => [...p, { descripcion:'',cantidad:1,precio_unitario:0,importe:0 }])}
        style={{ marginTop:8,background:'none',border:'1px dashed var(--linea)',borderRadius:8,padding:'6px 16px',color:'var(--muted)',cursor:'pointer',fontSize:12 }}>
        {t('invoice.addLine')}
      </button>

      {/* Totales */}
      <div style={{ marginTop:16,borderTop:'1px solid var(--linea)',paddingTop:12 }}>
        <div style={{ display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6,fontSize:13 }}>
          <div style={{ display:'flex',gap:20 }}>
            <span style={{ color:'var(--muted)' }}>{t('invoice.taxableBase')}</span>
            <span style={{ fontFamily:'JetBrains Mono, monospace',color:'var(--ink)',minWidth:90,textAlign:'right' }}>{formatEur(subtotal)}</span>
          </div>
          <div style={{ display:'flex',gap:20 }}>
            <span style={{ color: tipoIva==='normal'?'var(--muted)':'var(--naranja-text)' }}>
              {ivaTypeLabel(t, tipoIva, ivaRate)}
            </span>
            <span style={{ fontFamily:'JetBrains Mono, monospace',color: tipoIva==='normal'?'var(--ink)':'var(--naranja-text)',minWidth:90,textAlign:'right' }}>{formatEur(ivaImporte)}</span>
          </div>
          <div style={{ display:'flex',gap:20,borderTop:'1px solid var(--linea)',paddingTop:6 }}>
            <span style={{ fontWeight:700,color:'var(--ink)' }}>TOTAL</span>
            <span style={{ fontFamily:'JetBrains Mono, monospace',fontWeight:700,fontSize:16,color:'var(--naranja-text)',minWidth:90,textAlign:'right' }}>{formatEur(total)}</span>
          </div>
        </div>
        {legalNote && (
          <div style={{ marginTop:12,padding:'8px 12px',background:'rgba(255,122,26,0.05)',borderRadius:8,fontSize:11,color:'var(--muted-tint)',borderLeft:'3px solid var(--pulse)' }}>
            {legalNote}
          </div>
        )}
      </div>

      <Field label={t('label.notes')}><textarea aria-label={t('label.notes')} value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder={t('invoice.notesPh')} /></Field>

      {err && <div style={{ color:'var(--rojo-text)',fontSize:13,marginBottom:10 }}>{err}</div>}
      <div style={{ display:'flex',gap:10,justifyContent:'flex-end',marginTop:8 }}>
        <button type="button" onClick={onClose} style={{ padding:'9px 20px',borderRadius:8,border:'1px solid var(--linea)',background:'none',color:'var(--muted)',cursor:'pointer' }}>{t('btn.cancel')}</button>
        <button type="submit" disabled={saving} style={{ padding:'9px 20px',borderRadius:8,border:'none',background:'var(--pulse)',color:'var(--petrol)',fontWeight:700,cursor:'pointer' }}>
          {saving ? t('common.saving') : t('invoice.create')}
        </button>
      </div>
    </form>
  );
}

// ── Verifactu: base apagada (modo pruebas / no certificado) ──
type VerifactuRec = {
  huella: string; huella_anterior: string; qr_url: string; num_serie: string;
  fecha_expedicion: string; modo: string; certificado: boolean;
};
function VerifactuBlock({ facturaId }: { facturaId: number }) {
  const { t } = useLang();
  const [rec, setRec] = useState<VerifactuRec | null>(null);
  const [qr, setQr] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setRec(null); setQr('');
    apiFetch<VerifactuRec | null>(`/ops/facturas/${facturaId}/verifactu`).then(setRec).catch(() => {});
  }, [facturaId]);

  useEffect(() => {
    if (rec?.qr_url) QRCode.toDataURL(rec.qr_url, { errorCorrectionLevel: 'M', margin: 1, width: 150 }).then(setQr).catch(() => {});
  }, [rec]);

  async function generar() {
    setLoading(true); setErr('');
    try { setRec(await apiFetch<VerifactuRec>(`/ops/facturas/${facturaId}/verifactu`, { method: 'POST' })); }
    catch (e) { setErr(e instanceof Error ? e.message : t('common.saveError')); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ border:'1px solid var(--linea)', borderRadius:8, padding:'12px 14px', marginBottom:16, background:'#FFFDF8' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--ink)' }}>Verifactu</span>
        <span style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--naranja-tint)', background:'rgba(255,122,26,0.12)', padding:'2px 6px', borderRadius:6 }}>{t('invoice.verifactu.testMode')}</span>
      </div>
      {!rec ? (
        <>
          <p style={{ fontSize:12, color:'var(--muted)', marginBottom:8 }}>
            {t('invoice.verifactu.help')}
          </p>
          <button type="button" onClick={generar} disabled={loading}
            style={{ padding:'7px 14px', borderRadius:6, border:'none', background:'var(--petrol)', color:'var(--ivory)', fontWeight:700, fontSize:12, cursor:'pointer' }}>
            {loading ? t('invoice.verifactu.generating') : t('invoice.verifactu.generate')}
          </button>
          {err && <p style={{ color:'var(--rojo-text)', fontSize:12, marginTop:6 }}>{err}</p>}
        </>
      ) : (
        <div style={{ display:'flex', gap:16, alignItems:'flex-start', flexWrap:'wrap' }}>
          {qr && <img src={qr} alt={t('invoice.verifactu.qrAlt')} width={130} height={130} style={{ border:'1px solid var(--linea)', borderRadius:6 }} />}
          <div style={{ flex:1, minWidth:220, fontSize:11, color:'var(--muted-tint)' }}>
            <div style={{ marginBottom:4 }}><strong>{t('invoice.verifactu.hash')}:</strong> <span style={{ fontFamily:'JetBrains Mono, monospace', wordBreak:'break-all' }}>{rec.huella}</span></div>
            <div style={{ marginBottom:4 }}><strong>{t('invoice.verifactu.previous')}:</strong> <span style={{ fontFamily:'JetBrains Mono, monospace' }}>{rec.huella_anterior || t('invoice.verifactu.first')}</span></div>
            <div><strong>QR:</strong> <span style={{ wordBreak:'break-all' }}>{rec.qr_url}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Invoices() {
  const { t } = useLang();
  const [facturas, setFacturas]       = useState<Factura[]>([]);
  const [clientes, setClientes]       = useState<Cliente[]>([]);
  const [filterEstado, setFilter]     = useState<'all' | EstadoFactura>('all');
  const [showModal, setShowModal]     = useState(false);
  const [selected, setSelected]       = useState<Factura | null>(null);
  const [selectedLineas, setSelLineas]= useState<FacturaLinea[]>([]);
  const [loading, setLoading]         = useState(true);

  const load = useCallback(() => Promise.all([
    apiFetch<Factura[]>('/ops/facturas'),
    apiFetch<Cliente[]>('/ops/clientes'),
  ]).then(([f, c]) => { setFacturas(f); setClientes(c); }), []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const enriched = facturas.map(f => ({ ...f, estado: isOverdue(f) ? 'vencida' as const : f.estado }));
  const filtered = enriched.filter(f => filterEstado === 'all' || f.estado === filterEstado);

  const collected   = enriched.filter(f => f.estado==='cobrada').reduce((s,f)=>s+f.total,0);
  const outstanding = enriched.filter(f=>['enviada','vencida'].includes(f.estado)).reduce((s,f)=>s+f.total,0);

  async function createInvoice(data: Record<string, unknown>) {
    await apiFetch('/ops/facturas', { method:'POST', body:JSON.stringify(data) });
    await load();
  }

  async function updateEstado(id: number, estado: EstadoFactura, extra: Record<string, unknown> = {}) {
    const updated = await apiFetch<Factura>(`/ops/facturas/${id}`, { method:'PUT', body:JSON.stringify({ estado, ...extra }) });
    // Si se cobra → crea automáticamente el ingreso en Caja
    if (estado === 'cobrada') {
      const f = enriched.find(x => x.id === id);
      if (f) {
        await apiFetch('/ops/caja', {
          method: 'POST',
          body: JSON.stringify({
            tipo: 'ingreso', concepto: `Factura ${f.numero}`,
            importe: f.total, tipo_iva: f.tipo_iva, iva_rate: f.iva_rate,
            iva_importe: f.iva_importe, fecha: new Date().toISOString().split('T')[0],
            categoria: 'Invoice', cliente_id: f.cliente_id, factura_id: f.id,
          }),
        });
      }
    }
    await load();
    if (selected?.id === id) setSelected({ ...selected, ...updated });
  }

  async function openDetail(f: Factura) {
    setSelected(f);
    const lineas = await apiFetch<FacturaLinea[]>(`/ops/facturas/${f.id}/lineas`);
    setSelLineas(lineas);
  }

  async function printInvoice() {
    if (!selected) return;
    generateInvoicePDF(selected, selectedLineas);
  }

  if (loading) return <div style={{ color:'var(--muted)' }}>{t('common.loading')}</div>;

  const ESTADOS_FILTER: ('all' | EstadoFactura)[] = ['all','borrador','enviada','cobrada','vencida'];

  return (
    <div>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24 }}>
        <h1 style={{ fontFamily:'Syne, sans-serif',fontSize:26,fontWeight:800,color:'var(--ink)',margin:0 }}>
          {t('ops.nav.invoices')}
        </h1>
        <div style={{ display:'flex',gap:10 }}>
          <button onClick={() => exportFacturasExcel(enriched)} style={{ display:'flex',alignItems:'center',gap:6,padding:'9px 16px',background:'var(--ivory-alt)',border:'none',borderRadius:8,color:'var(--ink)',cursor:'pointer',fontSize:13 }}>
            <Download size={14}/> {t('btn.export')}
          </button>
          <button onClick={() => setShowModal(true)} style={{ display:'flex',alignItems:'center',gap:6,padding:'9px 18px',background:'var(--pulse)',border:'none',borderRadius:8,color:'var(--petrol)',fontWeight:700,cursor:'pointer',fontSize:14 }}>
            <Plus size={16}/> {t('invoice.new')}
          </button>
        </div>
      </div>

      {/* Tarjetas resumen */}
      <div style={{ display:'flex',gap:16,marginBottom:24 }}>
        <div style={{ background:'var(--ivory-alt)',borderRadius:12,padding:'16px 20px',border:'1px solid var(--linea)',flex:1 }}>
          <div style={{ fontSize:12,color:'var(--muted)',marginBottom:4 }}>{t('ops.collected')}</div>
          <div style={{ fontFamily:'JetBrains Mono, monospace',fontSize:20,fontWeight:700,color:'var(--verde-text)' }}>{formatEur(collected)}</div>
        </div>
        <div style={{ background:'var(--ivory-alt)',borderRadius:12,padding:'16px 20px',border:'1px solid var(--linea)',flex:1 }}>
          <div style={{ fontSize:12,color:'var(--muted)',marginBottom:4 }}>{t('ops.outstanding')}</div>
          <div style={{ fontFamily:'JetBrains Mono, monospace',fontSize:20,fontWeight:700,color:'var(--naranja-text)' }}>{formatEur(outstanding)}</div>
        </div>
      </div>

      {/* Filtros por estado */}
      <div style={{ display:'flex',gap:8,marginBottom:20 }}>
        {ESTADOS_FILTER.map(e => (
          <button key={e} onClick={() => setFilter(e)} style={{
            padding:'5px 14px',borderRadius:20,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,
            background: filterEstado===e?'var(--pulse)':'var(--ivory-alt)',
            color: filterEstado===e?'var(--petrol)':'var(--muted)',
          }}>
            {e==='all'?t('filter.allStatuses'):t(ESTADO_KEY[e] ?? e)}
          </button>
        ))}
      </div>

      {/* Tabla de facturas */}
      <div style={{ background:'var(--ivory-alt)',borderRadius:12,border:'1px solid var(--linea)',overflow:'hidden' }}>
        <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--linea)' }}>
              {[t('ops.invoiceNumber'),t('ops.clientName'),t('invoice.vatType'),t('ops.date'),t('invoice.dueShort'),t('ops.total'),t('ops.status'),''].map(h => (
                <th key={h} style={{ textAlign:'left',padding:'12px 16px',color:'var(--muted)',fontWeight:500,fontSize:12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding:'24px',color:'var(--muted)',textAlign:'center' }}>{t('ops.noInvoices')}</td></tr>
            ) : filtered.map(f => (
              <tr key={f.id} style={{ borderBottom:'1px solid var(--linea-alta)',cursor:'pointer' }} onClick={() => openDetail(f)}>
                <td style={{ padding:'10px 16px',fontFamily:'JetBrains Mono, monospace',fontSize:12,color:'var(--naranja-text)' }}>{f.numero}</td>
                <td style={{ padding:'10px 16px',color:'var(--ink)',fontWeight:500 }}>{f.cliente_nombre}</td>
                <td style={{ padding:'10px 16px' }}>
                  {f.tipo_iva === 'intracomunitario' && <span style={{ fontSize:11,color:'var(--naranja-tint)',background:'rgba(255,122,26,0.1)',padding:'2px 8px',borderRadius:20 }}>{t('invoice.vat.reverseShort')}</span>}
                  {f.tipo_iva === 'exento' && <span style={{ fontSize:11,color:'var(--muted)' }}>{t('invoice.vat.exempt')}</span>}
                  {f.tipo_iva === 'normal' && <span style={{ fontSize:11,color:'var(--muted)' }}>{t('invoice.vat.normalRate', { rate: f.iva_rate })}</span>}
                </td>
                <td style={{ padding:'10px 16px',color:'var(--muted)' }}>{formatDate(f.fecha_emision)}</td>
                <td style={{ padding:'10px 16px',color:f.estado==='vencida'?'var(--rojo-text)':'var(--muted)' }}>
                  {f.fecha_vencimiento ? formatDate(f.fecha_vencimiento) : '-'}
                </td>
                <td style={{ padding:'10px 16px',fontFamily:'JetBrains Mono, monospace',fontWeight:600,color:'var(--ink)' }}>{formatEur(f.total)}</td>
                <td style={{ padding:'10px 16px' }}><StatusBadge estado={f.estado} /></td>
                <td style={{ padding:'10px 16px',color:'var(--muted)' }}><ChevronRight size={14}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detalle de factura */}
      {selected && (
        <Modal title={t('invoice.detailTitle', { number: selected.numero })} onClose={() => setSelected(null)} wide>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',gap:16,marginBottom:16,fontSize:13 }}>
            <div>
              <div style={{ color:'var(--muted)',fontSize:11,marginBottom:4 }}>{t('ops.clientName')}</div>
              <div style={{ color:'var(--ink)',fontWeight:600 }}>{selected.cliente_nombre}</div>
              {selected.vat_number && <div style={{ color:'var(--muted)',fontSize:12 }}>VAT: {selected.vat_number}</div>}
            </div>
            <div>
              <div style={{ color:'var(--muted)',fontSize:11,marginBottom:4 }}>{t('invoice.amount')}</div>
              <div style={{ fontFamily:'JetBrains Mono, monospace',fontSize:20,fontWeight:700,color:'var(--naranja-text)' }}>{formatEur(selected.total)}</div>
              <div style={{ fontSize:12,color:'var(--muted)' }}>{jurisdictionLabelT(t, selected.iva_jurisdiccion ?? jurisdiccionFromFactura(selected.tipo_iva, selected.iva_rate))}{selected.tipo_iva==='normal'?` (${selected.iva_rate}%)`:' = 0%'}</div>
            </div>
            <div>
              <div style={{ color:'var(--muted)',fontSize:11 }}>{t('invoice.issueDue')}</div>
              <div style={{ color:'var(--ink)' }}>{formatDate(selected.fecha_emision)} → {selected.fecha_vencimiento ? formatDate(selected.fecha_vencimiento) : t('invoice.noDueDate')}</div>
            </div>
            <div>
              <div style={{ color:'var(--muted)',fontSize:11 }}>{t('ops.status')}</div>
              <StatusBadge estado={selected.estado} />
            </div>
          </div>

          {/* Vista previa de la nota legal */}
          {(() => { const jSel = selected.iva_jurisdiccion ?? jurisdiccionFromFactura(selected.tipo_iva, selected.iva_rate); const note = invoiceLegalNoteJurisdiccion(jSel, selected.iva_rate); return note ? (
            <div style={{ padding:'10px 14px',background:'rgba(255,122,26,0.06)',borderLeft:'3px solid var(--pulse)',borderRadius:8,fontSize:12,color:'var(--muted-tint)',marginBottom:16 }}>
              {note}
            </div>
          ) : null; })()}

          {/* Verifactu (solo facturas con IVA español) */}
          {(selected.iva_jurisdiccion ?? jurisdiccionFromFactura(selected.tipo_iva, selected.iva_rate)) === 'spain' && (
            <VerifactuBlock facturaId={selected.id} />
          )}

          {/* Líneas */}
          {selectedLineas.length > 0 && (
            <table style={{ width:'100%',borderCollapse:'collapse',fontSize:12,marginBottom:16 }}>
              <thead><tr style={{ borderBottom:'1px solid var(--linea)' }}>
                {[t('invoice.description'),t('invoice.qty'),t('invoice.unitPrice'),t('invoice.amount')].map(h => (
                  <th key={h} style={{ textAlign:'left',padding:'6px 8px',color:'var(--muted)',fontWeight:500 }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {selectedLineas.map(l => (
                  <tr key={l.id} style={{ borderBottom:'1px solid var(--linea-alta)' }}>
                    <td style={{ padding:'6px 8px',color:'var(--ink)' }}>{l.descripcion}</td>
                    <td style={{ padding:'6px 8px',color:'var(--muted)' }}>{l.cantidad}</td>
                    <td style={{ padding:'6px 8px',fontFamily:'JetBrains Mono, monospace',color:'var(--muted)' }}>{formatEur(l.precio_unitario)}</td>
                    <td style={{ padding:'6px 8px',fontFamily:'JetBrains Mono, monospace',fontWeight:600,color:'var(--ink)' }}>{formatEur(l.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Enlace de pago Revolut (Merchant API): se genera una vez y se guarda en la factura */}
          {selected.estado !== 'anulada' && selected.estado !== 'cobrada' && (
            <div style={{ display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:12,fontSize:12 }}>
              {selected.enlace_pago
                ? <><span style={{ color:'var(--muted)' }}>{t('invoice.paymentLink')}:</span><a href={selected.enlace_pago} target="_blank" rel="noopener" style={{ color:'var(--teal-tint)',wordBreak:'break-all' }}>{selected.enlace_pago}</a>
                    <button onClick={() => navigator.clipboard.writeText(selected.enlace_pago!)} style={{ padding:'4px 10px',borderRadius:6,border:'1px solid var(--linea)',background:'none',color:'var(--muted)',cursor:'pointer',fontSize:11 }}>{t('campaign.copy')}</button></>
                : <button onClick={async () => { try { const r = await apiFetch<{ url: string }>(`/ops/facturas/${selected.id}/enlace-pago`, { method:'POST' }); setSelected({ ...selected, enlace_pago: r.url }); await load(); } catch (e) { alert(String(e)); } }}
                    style={{ padding:'6px 14px',borderRadius:8,border:'1px solid var(--linea)',background:'none',color:'var(--muted)',cursor:'pointer',fontSize:12 }}>
                    {t('invoice.generatePaymentLink')}
                  </button>}
            </div>
          )}

          {/* Transiciones de estado */}
          <div style={{ display:'flex',gap:10,flexWrap:'wrap',borderTop:'1px solid var(--linea)',paddingTop:16 }}>
            {selected.estado === 'borrador' && (
              <button onClick={() => updateEstado(selected.id,'enviada')} style={{ padding:'8px 18px',borderRadius:8,border:'none',background:'rgba(23,129,127,0.15)',color:'var(--teal-tint)',cursor:'pointer',fontWeight:600 }}>
                {t('invoice.markSent')}
              </button>
            )}
            {selected.estado === 'enviada' && (
              <button onClick={() => updateEstado(selected.id,'cobrada')} style={{ padding:'8px 18px',borderRadius:8,border:'none',background:'rgba(23,129,127,0.15)',color:'var(--verde-text)',cursor:'pointer',fontWeight:600 }}>
                {t('invoice.markPaid')}
              </button>
            )}
            {(selected.estado === 'borrador' || selected.estado === 'enviada') && (
              <button onClick={() => updateEstado(selected.id,'anulada')} style={{ padding:'8px 18px',borderRadius:8,border:'none',background:'rgba(15,46,56,0.1)',color:'var(--muted)',cursor:'pointer' }}>
                {t('invoice.cancelInvoice')}
              </button>
            )}
            <button onClick={printInvoice} style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 18px',borderRadius:8,border:'1px solid var(--linea)',background:'none',color:'var(--ink)',cursor:'pointer' }}>
              <Printer size={14}/> {t('invoice.downloadPdf')}
            </button>
          </div>
        </Modal>
      )}

      {showModal && (
        <Modal title={t('invoice.new')} onClose={() => setShowModal(false)} wide>
          <InvoiceForm clientes={clientes} onSave={createInvoice} onClose={() => setShowModal(false)} />
        </Modal>
      )}
    </div>
  );
}
