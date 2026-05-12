import type { Account, Lead, Task, Activity } from '../types';

export const MOCK_ACCOUNTS: Account[] = [
  { id: 1, name: 'La Bahía Club', type: 'local', plan: 'pro_bi', stage: 'active', zone: 'Estepona', assigned_to: 'Cipry', mrr: 59, pulse_score: 82, contact_name: 'Roberto Vidal', contact_email: 'roberto@labahia.es', contact_phone: '+34 622 111 222', address: 'Avda. del Mar 14, Estepona', created_at: '2026-03-15', updated_at: '2026-05-10' },
  { id: 2, name: 'Grand Hotel Estepona', type: 'hotel', plan: 'hotel_elite', stage: 'active', zone: 'Estepona', assigned_to: 'Cipry', mrr: 429, pulse_score: 91, contact_name: 'María José López', contact_email: 'mj@grandestepona.es', contact_phone: '+34 952 000 111', address: 'Paseo Marítimo 80, Estepona', created_at: '2026-04-01', updated_at: '2026-05-09' },
  { id: 3, name: 'La Terraza del Puerto', type: 'local', plan: 'premium_local', stage: 'active', zone: 'Puerto Banús', assigned_to: 'Cipry', mrr: 29, pulse_score: 73, contact_name: 'Carlos Méndez', contact_email: 'carlos@laterraza.es', contact_phone: '+34 600 333 444', address: 'Puerto Banús, Local 22', created_at: '2026-03-20', updated_at: '2026-05-08' },
  { id: 4, name: 'Hotel Brisa Marina', type: 'hotel', plan: 'hotel_analytics', stage: 'active', zone: 'Marbella Centro', assigned_to: 'Heidi', mrr: 129, pulse_score: 67, contact_name: 'Antti Virtanen', contact_email: 'a.virtanen@brisamarina.es', contact_phone: '+34 952 000 222', address: 'Calle Ramón y Cajal 5, Marbella', created_at: '2026-04-10', updated_at: '2026-05-07' },
  { id: 5, name: 'Flamenco Andaluz', type: 'local', plan: 'premium_local', stage: 'demo_scheduled', zone: 'Estepona', assigned_to: 'Heidi', mrr: 0, contact_name: 'Ana Romero', contact_email: 'ana@flamencoandaluz.es', contact_phone: '+34 611 555 666', created_at: '2026-05-01', updated_at: '2026-05-12' },
  { id: 6, name: 'The Jazz Corner', type: 'local', plan: 'premium_local', stage: 'proposal_sent', zone: 'Marbella Centro', assigned_to: 'Cipry', mrr: 0, contact_name: 'James Taylor', contact_email: 'j.taylor@jazzcorner.es', contact_phone: '+34 622 777 888', created_at: '2026-05-03', updated_at: '2026-05-11' },
  { id: 7, name: 'Sunset Lounge', type: 'local', plan: 'premium_local', stage: 'active', zone: 'San Pedro de Alcántara', assigned_to: 'Heidi', mrr: 29, pulse_score: 71, contact_name: 'Sophie Müller', contact_email: 'sophie@sunsetlounge.es', contact_phone: '+34 633 999 000', created_at: '2026-04-15', updated_at: '2026-05-10' },
  { id: 8, name: 'Sky Rooftop Bar', type: 'local', plan: 'pro_bi', stage: 'negotiation', zone: 'Marbella Centro', assigned_to: 'Cipry', mrr: 0, contact_name: 'David Chen', contact_email: 'd.chen@skyrooftop.es', contact_phone: '+34 644 111 222', created_at: '2026-05-05', updated_at: '2026-05-12' },
];

export const MOCK_LEADS: Lead[] = [
  { id: 1, name: 'Casa Paco · Tapas', type: 'local', zone: 'Fuengirola', source: 'Google Maps', status: 'new', assigned_to: 'Heidi', created_at: '2026-05-12' },
  { id: 2, name: 'Hotel Riviera Marbella', type: 'hotel', zone: 'Marbella Centro', source: 'Instagram', status: 'contacted', assigned_to: 'Heidi', created_at: '2026-05-11' },
  { id: 3, name: 'El Ancla Fuengirola', type: 'local', zone: 'Fuengirola', source: 'Caminando', status: 'interested', assigned_to: 'Cipry', created_at: '2026-05-10' },
  { id: 4, name: "Pepe's Chiringuito", type: 'local', zone: 'Benalmádena Costa', source: 'Referido', status: 'new', assigned_to: 'Cipry', created_at: '2026-05-12' },
  { id: 5, name: 'La Marina Beach', type: 'local', zone: 'Estepona', source: 'Google Maps', status: 'contacted', assigned_to: 'Cipry', created_at: '2026-05-09' },
  { id: 6, name: 'Ocean Club Marbella', type: 'local', zone: 'Marbella Centro', source: 'Instagram', status: 'attempting_contact', assigned_to: 'Heidi', created_at: '2026-05-08' },
  { id: 7, name: 'Hotel Sol Arena', type: 'hotel', zone: 'Torremolinos', source: 'LinkedIn', status: 'new', assigned_to: 'Cipry', created_at: '2026-05-07' },
  { id: 8, name: 'La Bodega de Antonio', type: 'local', zone: 'Nerja', source: 'Google Maps', status: 'new', assigned_to: 'Heidi', created_at: '2026-05-12' },
];

export const MOCK_TASKS: Task[] = [
  { id: 1, title: 'Demo Flamenco Andaluz — 18:00', due_at: '2026-05-13T18:00', priority: 'urgent', assigned_to: 'Heidi', account_id: 5, account_name: 'Flamenco Andaluz', done: false },
  { id: 2, title: 'Enviar propuesta The Jazz Corner', due_at: '2026-05-13T12:00', priority: 'high', assigned_to: 'Cipry', account_id: 6, account_name: 'The Jazz Corner', done: false },
  { id: 3, title: 'Follow-up Hotel Riviera Marbella', due_at: '2026-05-13T16:00', priority: 'high', assigned_to: 'Heidi', done: false },
  { id: 4, title: 'Prospectar bares zona Puerto Banús', due_at: '2026-05-14T10:00', priority: 'medium', assigned_to: 'Cipry', done: false },
  { id: 5, title: 'Revisar contrato Grand Hotel Estepona', due_at: '2026-05-15T09:00', priority: 'medium', assigned_to: 'Cipry', account_id: 2, account_name: 'Grand Hotel Estepona', done: false },
];

export const MOCK_ACTIVITIES: Activity[] = [
  { id: 1, type: 'call', description: 'Llamada con Roberto Vidal — confirman interés en upgrade Pro BI', agent: 'Cipry', created_at: '2026-05-12T10:30', account_id: 1, account_name: 'La Bahía Club' },
  { id: 2, type: 'system', description: 'Lead nuevo: Hotel Riviera Marbella — fuente: Instagram manual', agent: 'Heidi', created_at: '2026-05-11T11:00' },
  { id: 3, type: 'email', description: 'Propuesta enviada a The Jazz Corner (plan Premium Local)', agent: 'Cipry', created_at: '2026-05-11T09:15', account_id: 6, account_name: 'The Jazz Corner' },
  { id: 4, type: 'visit', description: 'Visita a Flamenco Andaluz — demo agendada para 13/05', agent: 'Heidi', created_at: '2026-05-10T17:45', account_id: 5, account_name: 'Flamenco Andaluz' },
  { id: 5, type: 'note', description: 'Sky Rooftop Bar pide condiciones especiales — negociando', agent: 'Cipry', created_at: '2026-05-10T14:20', account_id: 8, account_name: 'Sky Rooftop Bar' },
];
