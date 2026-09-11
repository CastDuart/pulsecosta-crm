export const NOVITUM_COMPANY = {
  legalName: 'Novitum Technologies OÜ',
  registryCode: '17545241',
  vatNumber: 'EE103018821',
  address: 'Narva mnt 5, Kesklinna district, Tallinn, 10117 Harju County, Estonia',
  email: 'info@novitum.io',
} as const;

export const PULSECOSTA_PRODUCT = {
  name: 'PulseCosta',
  crmName: 'PulseCosta CRM',
} as const;

export const SELLER_LEGAL_LINES = [
  `Reg. code: ${NOVITUM_COMPANY.registryCode}`,
  `VAT: ${NOVITUM_COMPANY.vatNumber}`,
  NOVITUM_COMPANY.address,
] as const;
