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
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: number;
  name: string;
  type: 'local' | 'hotel';
  zone: string;
  source: string;
  status: string;
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
