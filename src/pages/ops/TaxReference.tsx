import { AlertTriangle, Building2, ExternalLink, FileText } from 'lucide-react';
import { useLang } from '../../context/LangContext';

type TaxItem = {
  code: string;
  name: string;
  applies: 'yes' | 'conditional' | 'watch';
  cadence: string;
  scope: string;
  note: string;
};

type Jurisdiction = {
  id: string;
  title: string;
  summary: string;
  internal: string[];
  services: string[];
  items: TaxItem[];
  sources: { label: string; url: string }[];
};

const badgeColor: Record<TaxItem['applies'], [string, string]> = {
  yes: ['rgba(23,129,127,0.14)', 'var(--verde-text)'],
  conditional: ['rgba(255,122,26,0.14)', 'var(--naranja-text)'],
  watch: ['rgba(15,46,56,0.10)', 'var(--muted-tint)'],
};

const jurisdictions: Jurisdiction[] = [
  {
    id: 'estonia',
    title: 'Estonia',
    summary: 'Jurisdiccion principal de Novitum Technologies OÜ. Es la base contable/fiscal por defecto.',
    internal: [
      'OÜ estonia con registrikood 17545241 y VAT EE103018821.',
      'Beneficio retenido no tributa como impuesto de sociedades hasta distribucion o pagos asimilados.',
      'Enviar al gestor facturas emitidas/recibidas, banco, pasarelas, nominas/pagos a personas y gastos dudosos.',
    ],
    services: [
      'B2B Estonia: IVA estonio si el servicio es imponible y el lugar de suministro es Estonia.',
      'B2B UE: normalmente reverse charge si el cliente empresa facilita VAT valido.',
      'B2C UE: revisar OSS/IVA de consumo si se vende a particulares.',
    ],
    items: [
      { code: 'KMD / KMD INF', name: 'VAT return / anexo de facturas', applies: 'yes', cadence: 'Mensual, dia 20', scope: 'IVA Estonia', note: 'Para sujeto IVA. Separar ventas Estonia, compras/ventas UE y operaciones a 0%.' },
      { code: 'VD', name: 'Recapitulative statement', applies: 'conditional', cadence: 'Mensual si hay B2B UE', scope: 'Servicios intracomunitarios', note: 'Relevante para servicios B2B UE con reverse charge y VAT cliente validado.' },
      { code: 'TSD', name: 'Income and social tax return', applies: 'conditional', cadence: 'Mensual, dia 10', scope: 'Nominas, dividendos, fringe benefits, gastos no negocio', note: 'No es por beneficio contable; se activa por pagos/costes gravables.' },
      { code: 'Annual report', name: 'Informe anual al e-Business Register', applies: 'yes', cadence: 'Anual, 6 meses tras cierre', scope: 'Cuentas anuales OÜ', note: 'Preparar contabilidad cerrada, notas y aprobacion societaria.' },
      { code: 'OSS', name: 'One Stop Shop', applies: 'conditional', cadence: 'Trimestral si hay B2C UE', scope: 'Ventas digitales/servicios a consumidores UE', note: 'Solo si hay ventas B2C UE que entren en reglas de consumo.' },
    ],
    sources: [
      { label: 'EMTA - VAT returns KMD/VD', url: 'https://www.emta.ee/en/business-client/taxes-and-payment/tax-returns-exchange-information/vat-return-forms-vd-and-vdp' },
      { label: 'EMTA - TSD', url: 'https://www.emta.ee/en/business-client/taxes-and-payment/income-and-social-taxes/submission-declaration-form-tsd/deklaratsiooni-tsd-taitmise-pohimotted' },
      { label: 'e-Business Register - annual report', url: 'https://www.rik.ee/en/e-business-register/annual-report' },
    ],
  },
  {
    id: 'spain',
    title: 'Espana',
    summary: 'Relevante por clientes y operativa PulseCosta. No debe ser la jurisdiccion fiscal por defecto de una OÜ estonia sin validacion del gestor.',
    internal: [
      'Confirmar con gestor si existe establecimiento permanente, registro de IVA espanol o pagador con retenciones en Espana.',
      'Verifactu/IVA espanol solo deberian activarse para operaciones con IVA espanol repercutido.',
      'Para B2B desde la OÜ a empresas espanolas, revisar reverse charge antes de usar IVA 21%.',
    ],
    services: [
      'B2B Espana con cliente empresa/VAT: normalmente inversion del sujeto pasivo si Novitum factura desde Estonia.',
      'B2C Espana: puede requerir tratamiento de IVA de consumo/OSS segun servicio y volumen.',
      'Operaciones localizadas en Espana o con registro espanol: activar modelos AEAT aplicables solo tras confirmacion.',
    ],
    items: [
      { code: '303', name: 'Autoliquidacion IVA', applies: 'conditional', cadence: 'Trimestral o mensual', scope: 'IVA espanol', note: 'Solo si Novitum debe repercutir/declarar IVA en Espana.' },
      { code: '390', name: 'Resumen anual IVA', applies: 'conditional', cadence: 'Anual', scope: 'IVA espanol', note: 'Relacionado con 303; verificar exoneraciones segun caso.' },
      { code: '349', name: 'Operaciones intracomunitarias', applies: 'conditional', cadence: 'Mensual/trimestral/anual segun volumen', scope: 'UE', note: 'Puede aplicar a sujetos registrados en Espana; para OÜ estonia se revisa via Estonia/VD.' },
      { code: '347', name: 'Operaciones con terceros', applies: 'conditional', cadence: 'Anual', scope: 'Declaracion informativa', note: 'Solo si existe obligacion espanola y operaciones superan umbrales.' },
      { code: '111 / 190', name: 'Retenciones trabajo/profesionales', applies: 'conditional', cadence: 'Trimestral + anual', scope: 'IRPF retenciones', note: 'Si Novitum actua como retenedor en Espana.' },
      { code: '115 / 180', name: 'Retenciones alquileres urbanos', applies: 'conditional', cadence: 'Trimestral + anual', scope: 'Alquiler oficina/local Espana', note: 'Solo si hay alquiler sujeto a retencion espanola.' },
      { code: '123 / 193', name: 'Retenciones capital mobiliario', applies: 'conditional', cadence: 'Trimestral + anual', scope: 'Intereses/dividendos', note: 'Solo si hay pagos sujetos a retencion espanola.' },
      { code: '200 / 202', name: 'Impuesto sobre Sociedades / pagos fraccionados', applies: 'watch', cadence: 'Anual / pagos', scope: 'Sociedad espanola o EP', note: 'No aplicar a la OÜ salvo establecimiento permanente o filial espanola.' },
      { code: '036 / 037', name: 'Censo fiscal', applies: 'watch', cadence: 'Alta/modificaciones', scope: 'Registro fiscal Espana', note: 'Solo si se tramita alta fiscal espanola.' },
    ],
    sources: [
      { label: 'AEAT - Modelos y formularios', url: 'https://sede.agenciatributaria.gob.es/' },
      { label: 'AEAT - Modelo 303', url: 'https://sede.agenciatributaria.gob.es/Sede/procedimientoini/G414.shtml' },
      { label: 'AEAT - Modelo 349', url: 'https://sede.agenciatributaria.gob.es/Sede/procedimientoini/GI28.shtml' },
    ],
  },
  {
    id: 'finland',
    title: 'Finlandia',
    summary: 'Relevante por clientes finlandeses y posibles ventas B2C. No implica obligaciones finlandesas automaticas para la OÜ.',
    internal: [
      'Confirmar si Novitum esta registrada en Finlandia para VAT, employer register o prepayment register.',
      'Si solo hay clientes B2B finlandeses con VAT valido, normalmente se factura reverse charge desde Estonia.',
      'Si se contrata personal/establecimiento en Finlandia, cambian las obligaciones.',
    ],
    services: [
      'B2B Finlandia: reverse charge con VAT valido del cliente.',
      'B2C Finlandia: revisar IVA de consumo/OSS.',
      'Equipo o presencia local: revisar nominas Incomes Register y registros finlandeses.',
    ],
    items: [
      { code: 'VAT return', name: 'Return for self-assessed taxes', applies: 'conditional', cadence: 'Mensual/trimestral/anual segun registro', scope: 'IVA Finlandia', note: 'Solo si Novitum esta registrada a IVA en Finlandia o tiene obligacion local.' },
      { code: 'VAT recapitulative statement', name: 'EU sales list', applies: 'conditional', cadence: 'Mensual si aplica', scope: 'Ventas UE desde registro FI', note: 'Para operaciones intracomunitarias desde sujeto registrado en Finlandia.' },
      { code: 'OSS', name: 'Union scheme', applies: 'conditional', cadence: 'Trimestral si B2C UE', scope: 'Servicios digitales/B2C', note: 'Puede gestionarse desde Estonia si Novitum usa OSS alli; confirmar pais de identificacion.' },
      { code: '6B', name: 'Corporate income tax return', applies: 'watch', cadence: 'Anual', scope: 'Entidad/EP finlandes', note: 'No aplicar salvo sociedad/establecimiento permanente en Finlandia.' },
      { code: 'Incomes Register', name: 'Earnings payment report / employer separate report', applies: 'conditional', cadence: 'Por pago + mensual', scope: 'Nominas/pagos a personas', note: 'Solo si hay trabajadores/pagos sujetos en Finlandia.' },
      { code: 'Financial statements', name: 'Presentacion al Trade Register', applies: 'watch', cadence: 'Anual si entidad FI', scope: 'Cuentas finlandesas', note: 'No aplica a OÜ estonia salvo estructura finlandesa.' },
    ],
    sources: [
      { label: 'Finnish Tax Administration - VAT', url: 'https://www.vero.fi/en/businesses-and-corporations/taxes-and-charges/vat/' },
      { label: 'Finnish Tax Administration - self-assessed taxes', url: 'https://www.vero.fi/en/businesses-and-corporations/taxes-and-charges/self-assessed-taxes/' },
      { label: 'Incomes Register', url: 'https://www.vero.fi/en/incomes-register/' },
    ],
  },
  {
    id: 'uk',
    title: 'Reino Unido',
    summary: 'Relevante si hay clientes UK, entidad UK, registro VAT UK o empleados/operativa local. Tras Brexit, tratar separado de UE.',
    internal: [
      'Sin sociedad/branch/VAT UK, normalmente no hay CT600, PAYE ni Companies House para la OÜ.',
      'Confirmar si ventas B2C UK de servicios digitales requieren VAT UK por reglas locales.',
      'B2B UK suele depender de place of supply y reverse charge/imported services del cliente.',
    ],
    services: [
      'B2B UK: normalmente no cargar VAT UK si cliente empresarial y servicio B2B fuera de UK; confirmar caso.',
      'B2C UK: posible VAT UK si el servicio esta dentro de reglas UK para consumidores.',
      'Entidad/empleados UK: activar calendario Companies House, HMRC, PAYE y VAT.',
    ],
    items: [
      { code: 'CT600', name: 'Company Tax Return', applies: 'watch', cadence: 'Anual', scope: 'Corporation Tax UK', note: 'Solo con limited company/branch/establecimiento sujeto en UK.' },
      { code: 'Annual accounts', name: 'Companies House accounts', applies: 'watch', cadence: 'Anual', scope: 'Sociedad UK', note: 'No aplica a OÜ salvo entidad registrada en UK.' },
      { code: 'CS01', name: 'Confirmation statement', applies: 'watch', cadence: 'Anual', scope: 'Companies House', note: 'Solo si hay sociedad UK.' },
      { code: 'VAT return / MTD', name: 'Making Tax Digital VAT return', applies: 'conditional', cadence: 'Normalmente trimestral', scope: 'VAT UK', note: 'Si Novitum debe registrarse a VAT UK o tiene ventas B2C UK sujetas.' },
      { code: 'PAYE RTI FPS/EPS', name: 'Payroll submissions', applies: 'conditional', cadence: 'Cada pago / mensual', scope: 'Empleados UK', note: 'Solo si hay nominas UK.' },
      { code: 'P11D', name: 'Benefits and expenses', applies: 'conditional', cadence: 'Anual si hay beneficios', scope: 'Empleados/directores UK', note: 'Solo si hay personal UK con beneficios declarables.' },
    ],
    sources: [
      { label: 'GOV.UK - Corporation Tax', url: 'https://www.gov.uk/company-tax-returns' },
      { label: 'GOV.UK - VAT returns', url: 'https://www.gov.uk/submit-vat-return' },
      { label: 'GOV.UK - PAYE RTI', url: 'https://www.gov.uk/paye-for-employers' },
      { label: 'GOV.UK - Companies House filings', url: 'https://www.gov.uk/running-a-limited-company' },
    ],
  },
];

export default function TaxReference() {
  const { t } = useLang();

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>{t('tax.title')}</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 13, maxWidth: 900 }}>{t('tax.subtitle')}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 18 }}>
        <div style={summaryCardStyle}>
          <Building2 size={18} />
          <div>
            <div style={summaryTitleStyle}>{t('tax.defaultCountry')}</div>
            <div style={summaryTextStyle}>Estonia · Novitum Technologies OÜ</div>
          </div>
        </div>
        <div style={summaryCardStyle}>
          <FileText size={18} />
          <div>
            <div style={summaryTitleStyle}>{t('tax.operatingScope')}</div>
            <div style={summaryTextStyle}>{t('tax.scopeText')}</div>
          </div>
        </div>
        <div style={summaryCardStyle}>
          <AlertTriangle size={18} />
          <div>
            <div style={summaryTitleStyle}>{t('tax.warningTitle')}</div>
            <div style={summaryTextStyle}>{t('tax.warningText')}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {jurisdictions.map(country => (
          <section key={country.id} style={sectionStyle}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--linea)' }}>
              <h2 style={{ margin: 0, color: 'var(--ink)', fontSize: 18 }}>{country.title}</h2>
              <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 13 }}>{country.summary}</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, padding: 18 }}>
              <InfoList title={t('tax.internal')} items={country.internal} />
              <InfoList title={t('tax.services')} items={country.services} />
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {[t('tax.form'), t('tax.applies'), t('tax.cadence'), t('tax.scope'), t('tax.note')].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {country.items.map(item => {
                    const [bg, color] = badgeColor[item.applies];
                    return (
                      <tr key={`${country.id}-${item.code}`} style={{ borderTop: '1px solid var(--linea-alta)' }}>
                        <td style={tdStyle}>
                          <strong style={{ color: 'var(--ink)' }}>{item.code}</strong>
                          <div style={{ color: 'var(--muted)', fontSize: 12 }}>{item.name}</div>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ background: bg, color, borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>
                            {t(`tax.applies.${item.applies}`)}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--muted-tint)' }}>{item.cadence}</td>
                        <td style={{ ...tdStyle, color: 'var(--ink)' }}>{item.scope}</td>
                        <td style={{ ...tdStyle, color: 'var(--muted-tint)', minWidth: 260 }}>{item.note}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 18, borderTop: '1px solid var(--linea)' }}>
              {country.sources.map(source => (
                <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" style={sourceStyle}>
                  {source.label} <ExternalLink size={12} />
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{ background: 'var(--ivory)', border: '1px solid var(--linea)', borderRadius: 8, padding: 14 }}>
      <div style={{ color: 'var(--ink)', fontSize: 13, fontWeight: 800, marginBottom: 8 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--muted-tint)', fontSize: 12, lineHeight: 1.55 }}>
        {items.map(item => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  background: 'var(--ivory-alt)',
  border: '1px solid var(--linea)',
  borderRadius: 8,
  overflow: 'hidden',
};

const summaryCardStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  alignItems: 'flex-start',
  padding: '14px 16px',
  background: 'var(--ivory-alt)',
  border: '1px solid var(--linea)',
  borderRadius: 8,
  color: 'var(--naranja-text)',
};

const summaryTitleStyle: React.CSSProperties = { color: 'var(--ink)', fontSize: 13, fontWeight: 800, marginBottom: 3 };
const summaryTextStyle: React.CSSProperties = { color: 'var(--muted)', fontSize: 12, lineHeight: 1.4 };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', color: 'var(--muted)', fontWeight: 600, fontSize: 12, borderTop: '1px solid var(--linea)', borderBottom: '1px solid var(--linea)' };
const tdStyle: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'top' };
const sourceStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '6px 10px',
  border: '1px solid var(--linea)',
  borderRadius: 8,
  color: 'var(--teal-tint)',
  textDecoration: 'none',
  fontSize: 12,
  fontWeight: 700,
};
