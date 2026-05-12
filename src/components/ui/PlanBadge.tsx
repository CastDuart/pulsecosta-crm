import type { Plan } from '../../types';
import { useLang } from '../../context/LangContext';

const PLAN_CLASS: Record<Plan, string> = {
  premium_local: 'badge-orange',
  pro_bi: 'badge-teal',
  hotel_analytics: 'badge-purple',
  hotel_elite: 'badge-gold',
};

export default function PlanBadge({ plan }: { plan: Plan }) {
  const { t } = useLang();
  return <span className={`badge ${PLAN_CLASS[plan]}`}>{t(`plan.${plan}`)}</span>;
}
