'use client';

import { useEffect, useState } from 'react';
import type { Proposal } from '@/lib/types';
import { skinFor, skinVars } from '@/lib/ui/verdict';

/**
 * The verdict moment. The burst and scale-in are a reveal effect for a value the
 * contract already produced — never a simulation of work that didn't happen.
 */
export const VerdictBanner = ({ proposal }: { proposal: Proposal }) => {
  const [go, setGo] = useState(false);
  const skin = skinFor(proposal.verdict);

  useEffect(() => {
    setGo(false);
    if (!proposal.verdict) return;
    const timer = setTimeout(() => setGo(true), 220);
    return () => clearTimeout(timer);
  }, [proposal.proposal_id, proposal.verdict]);

  if (!proposal.verdict) {
    return (
      <div className="panel" style={skinVars(skin)}>
        <div className="panel-head">Awaiting evaluation</div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
          This proposal has passed no checkpoint yet. No verdict exists until the contract
          produces one.
        </p>
      </div>
    );
  }

  const inconclusive =
    proposal.reason_code.includes('INCONCLUSIVE') ||
    proposal.reason_code === 'EVIDENCE_UNAVAILABLE' ||
    proposal.reason_code === 'EVIDENCE_FALLBACK_NO_EXECUTE';

  return (
    <div className="verdict-panel" style={skinVars(skin)}>
      <div className={`verdict-burst ${go ? 'go' : ''}`} />
      <div className={`verdict-text ${go ? 'go' : ''}`}>{proposal.verdict}</div>
      <div className="verdict-reason">{proposal.short_rationale || skin.note}</div>
      {proposal.material_changed_fact ? (
        <div className="verdict-compare">
          <span>
            Material fact <strong>{proposal.material_changed_fact}</strong>
          </span>
        </div>
      ) : null}
      <div className="verdict-note">{skin.note}</div>
      <div className="verdict-tags">
        <span className="tag tag-verdict">{proposal.reason_code || 'UNSPECIFIED'}</span>
        {proposal.confidence ? <span className="tag tag-neutral">confidence {proposal.confidence}</span> : null}
        {inconclusive ? <span className="tag tag-amber">fail-closed</span> : null}
      </div>
    </div>
  );
};
