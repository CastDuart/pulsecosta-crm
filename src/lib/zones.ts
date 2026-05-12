export const ZONES = [
  'Nerja',
  'Torrox Costa',
  'Torre del Mar',
  'Rincón de la Victoria',
  'Málaga Capital',
  'El Palo / La Malagueta',
  'Torremolinos',
  'Benalmádena Costa',
  'Fuengirola',
  'Mijas Costa / La Cala',
  'Calahonda',
  'Marbella Centro',
  'El Arenal / Marbella Este',
  'Puerto Banús',
  'Nueva Andalucía',
  'San Pedro de Alcántara',
  'Estepona',
  'Manilva / Castillo',
  'Sotogrande',
] as const;

export type Zone = (typeof ZONES)[number];
