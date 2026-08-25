export type Role =
  | 'super_admin'
  | 'sales_admin'
  | 'sales_rep'
  | 'cs_manager'
  | 'marketing_manager'
  | 'finance_admin'
  | 'read_only';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  initials: string;
}

export type PipelineStage =
  | 'new'
  | 'attempting_contact'
  | 'contacted'
  | 'interested'
  | 'demo_scheduled'
  | 'proposal_sent'
  | 'negotiation'
  | 'onboarding_pending'
  | 'payment_pending'
  | 'active'
  | 'at_risk'
  | 'churned'
  | 'lost';

export type Plan = 'premium_local' | 'pro_bi' | 'hotel_analytics' | 'hotel_elite';

export interface Account {
  id: number;
  name: string;
  type: 'local' | 'hotel';
  plan: Plan;
  stage: PipelineStage;
  zone: string;
  assigned_to: string;
  mrr: number;
  pulse_score?: number;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: number;
  name: string;
  type: 'local' | 'hotel';
  zone: string;
  source: string;
  stage: string;
  phone?: string;
  email?: string;
  assigned_to: string;
  created_at: string;
  notes?: string;
}

export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';

export interface Task {
  id: number;
  title: string;
  due_at: string;
  priority: TaskPriority;
  assigned_to: string;
  account_id?: number;
  account_name?: string;
  done: boolean;
}

export type ActivityType = 'call' | 'email' | 'visit' | 'note' | 'system';

export interface Activity {
  id: number;
  type: ActivityType;
  description: string;
  agent: string;
  created_at: string;
  account_id?: number;
  account_name?: string;
}

// ─── OPS types ────────────────────────────────────────────────────────────────
export interface Cliente {
  id: number; org_id: number; nombre: string; contacto?: string;
  vat_number?: string; tipo_cliente: 'b2b' | 'b2c'; pais: string;
  email?: string; telefono?: string; direccion?: string;
  codigo_postal?: string; ciudad?: string; notas?: string;
  activo: boolean; crm_account_id?: number; crm_account_name?: string;
  created_at: string;
}
export type TipoIva = 'normal' | 'intracomunitario' | 'exento';
export type IvaJurisdiccion = 'estonia' | 'spain' | 'eu' | 'exento';
export type EstadoFactura = 'draft' | 'sent' | 'collected' | 'overdue' | 'cancelled';
export type TipoFactura = 'normal' | 'recurring';
export type IntervaloRecurrencia = 'monthly' | 'quarterly' | null;
export interface FacturaLinea {
  id?: number; factura_id?: number; descripcion: string;
  cantidad: number; precio_unitario: number; importe: number; orden?: number;
}
export interface Factura {
  id: number; org_id: number; numero: string; cliente_id: number;
  cliente_nombre?: string; vat_number?: string; pais?: string;
  tipo_cliente?: string; cliente_email?: string;
  fecha_emision: string; fecha_vencimiento?: string; metodo_pago: string;
  tipo_iva: TipoIva; iva_jurisdiccion?: IvaJurisdiccion; iva_rate: number; subtotal: number;
  iva_importe: number; total: number; tipo: TipoFactura;
  intervalo_recurrencia?: IntervaloRecurrencia; estado: EstadoFactura;
  notas?: string; created_at: string; lineas?: FacturaLinea[];
}
export type TipoMovimiento = 'income' | 'expense';
export interface CajaMovimiento {
  id: number; org_id: number; tipo: TipoMovimiento; concepto: string;
  importe: number; tipo_iva: TipoIva; iva_rate: number; iva_importe: number;
  fecha: string; categoria?: string; cliente_id?: number;
  cliente_nombre?: string; factura_id?: number; recurrente: boolean;
  intervalo?: string; notas?: string; created_at: string;
}
export interface Jornada {
  id: number; user_id: number; user_name?: string; user_email?: string;
  org_id: number; fecha: string; entrada: string; salida?: string;
  total_minutos?: number; lat_entrada?: number; lng_entrada?: number;
  direccion_entrada?: string; lat_salida?: number; lng_salida?: number;
  direccion_salida?: string; tipo?: string; notas?: string;
}
export interface Visita {
  id: number; org_id: number; venue: string; ciudad?: string;
  direccion?: string; contacto?: string; telefono?: string; email?: string;
  vat_number?: string; fecha: string; plan?: string;
  estado: 'pending' | 'follow_up' | 'closed' | 'lost';
  prioridad: 'low' | 'medium' | 'high'; propuesta_enviada: boolean;
  fecha_seguimiento?: string; proxima_accion?: string; notas?: string;
  cliente_id?: number; cliente_nombre?: string; factura_id?: number;
  venue_id?: string; venue_public_name?: string; venue_category?: string;
  venue_lat?: number; venue_lng?: number;
  created_at: string;
}
export type TimeFilter = 'all' | 'this_month' | 'last_month' | 'this_year';
