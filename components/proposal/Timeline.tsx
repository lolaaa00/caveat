import type { Proposal } from '@/lib/types';
import { decidedDeterministically } from '@/lib/ui/verdict';

interface Step {
  label: string;
  lit: boolean;
  skipped?: boolean;
  note?: string;
}

/**
 * The evaluation timeline. Every stage reflects what the contract actually recorded —
 * a step is marked "skipped" rather than lit when the pipeline stopped before reaching
 * it, most visibly when a deterministic BLOCK never touched evidence or a model at all.
 */
export const Timeline = ({ proposal }: { proposal: Proposal }) => {
  const decided = Boolean(proposal.decided_at);
  const deterministicOnly = decided && decidedDeterministically(proposal);
  const hasEvidence = proposal.evidence.length > 0;

  const steps: Step[] = [
    { label: 'Mandate created', lit: true },
    { label: 'Action proposed', lit: true },
    { label: 'Deterministic checks', lit: decided },
    {
      label: 'Evidence retrieved',
      lit: hasEvidence,
      skipped: decided && !hasEvidence,
      note: deterministicOnly ? 'no model call' : undefined,
    },
    {
      label: 'Semantic judgement',
      lit: decided && hasEvidence,
      skipped: decided && !hasEvidence,
    },
    { label: 'Validator consensus', lit: Boolean(proposal.verdict) && hasEvidence, skipped: deterministicOnly },
    { label: 'Verdict', lit: Boolean(proposal.verdict) },
  ];

  return (
    <div className="timeline">
      {steps.map((step, i) => (
        <div key={step.label}>
          <div className={`tl-step ${step.lit ? 'lit' : ''} ${step.skipped ? 'skipped' : ''}`}>
            <div className="tl-dot" />
            <div className="tl-label">{step.label}</div>
            {step.skipped ? <div className="tl-note">skipped</div> : null}
          </div>
          {i < steps.length - 1 ? <div className="tl-line" /> : null}
        </div>
      ))}
    </div>
  );
};
