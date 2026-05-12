import type { PipelineStage } from '../../types';
import { useLang } from '../../context/LangContext';

const STAGE_CLASS: Record<PipelineStage, string> = {
  new: 'badge-gray',
  attempting_contact: 'badge-gray',
  contacted: 'badge-teal',
  interested: 'badge-teal',
  demo_scheduled: 'badge-orange',
  proposal_sent: 'badge-orange',
  negotiation: 'badge-gold',
  onboarding_pending: 'badge-purple',
  payment_pending: 'badge-purple',
  active: 'badge-green',
  at_risk: 'badge-red',
  churned: 'badge-red',
  lost: 'badge-red',
};

export default function StageBadge({ stage }: { stage: PipelineStage }) {
  const { t } = useLang();
  return <span className={`badge ${STAGE_CLASS[stage]}`}>{t(`stage.${stage}`)}</span>;
}
