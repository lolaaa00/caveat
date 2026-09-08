import type { Proposal } from '@/lib/types';
import { Badge } from '@/components/ui/primitives';

const COPY = {
  EXECUTE: {
    tone: 'execute' as const,
    headline: 'EXECUTE',
    gate: 'Execution authorized',
    gloss: 'Every purpose-critical condition in the mandate still holds.',
    border: 'border-execute/60',
    bg: 'bg-execute-dim',
    text: 'text-execute',
  },
  RECONFIRM: {
    tone: 'reconfirm' as const,
    headline: 'RECONFIRM',
    gate: 'Execution locked',
    gloss:
      'The agent still holds valid authority, but acting now would no longer faithfully represent the principal’s intent.',
    border: 'border-reconfirm/60',
    bg: 'bg-reconfirm-dim',
    text: 'text-reconfirm',
  },
  BLOCK: {
    tone: 'block' as const,
    headline: 'BLOCK',
    gate: 'Execution refused',
    gloss: 'The proposed action contradicts the mandate.',
    border: 'border-block/60',
    bg: 'bg-block-dim',
    text: 'text-block',
  },
};

export const VerdictBanner = ({ proposal }: { proposal: Proposal }) => {
  if (!proposal.verdict) {
    return (
      <div className="border border-line bg-panel px-5 py-6">
        <div className="label mb-2">Awaiting evaluation</div>
        <p className="text-[13px] text-ink-dim">
          This proposal has passed no checkpoint yet. No verdict exists until the contract
          produces one.
        </p>
      </div>
    );
  }

  const copy = COPY[proposal.verdict as keyof typeof COPY];
  const inconclusive = proposal.reason_code.includes('INCONCLUSIVE')
    || proposal.reason_code === 'EVIDENCE_UNAVAILABLE'
    || proposal.reason_code === 'EVIDENCE_FALLBACK_NO_EXECUTE';

  return (
    <div className={`border ${copy.border} ${copy.bg} px-5 py-5`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2">GenLayer consensus</div>
          <div className={`datum text-[44px] leading-none tracking-[0.06em] ${copy.text}`}>
            {copy.headline}
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Badge tone={copy.tone}>{copy.gate}</Badge>
          <div className="flex flex-wrap gap-2">
            <Badge>{proposal.reason_code || 'UNSPECIFIED'}</Badge>
            {proposal.confidence ? <Badge>confidence {proposal.confidence}</Badge> : null}
            {inconclusive ? <Badge tone="reconfirm">fail-closed</Badge> : null}
          </div>
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-[13px] leading-relaxed text-ink">{copy.gloss}</p>

      {proposal.material_changed_fact ? (
        <div className="mt-4 border-l-2 border-line-strong pl-3">
          <div className="label mb-1">Material changed fact</div>
          <p className="text-[13px] text-ink">{proposal.material_changed_fact}</p>
        </div>
      ) : null}

      {proposal.short_rationale ? (
        <div className="mt-3 border-l-2 border-line-strong pl-3">
          <div className="label mb-1">Contract rationale</div>
          <p className="text-[13px] text-ink-dim">{proposal.short_rationale}</p>
        </div>
      ) : null}
    </div>
  );
};
