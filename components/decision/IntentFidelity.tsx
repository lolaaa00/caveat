import type { Proposal } from '@/lib/types';
import { decidedDeterministically } from '@/lib/ui/verdict';

const NODES = ['Original Intent', 'Proposed Action', 'Current Context', 'Decision'];

/**
 * Where the chain from intent to decision snaps, if it does. The break position is
 * derived from real proposal state, not scripted per scenario:
 *
 * - a deterministic BLOCK snaps between "Proposed Action" and "Current Context" —
 *   the action itself violated the mandate, so context was never even evaluated
 * - a semantic RECONFIRM or BLOCK snaps between "Current Context" and "Decision" —
 *   evidence was fetched and judged, but it no longer supports the mandate
 * - EXECUTE, or a proposal not yet evaluated, breaks nothing
 */
export const IntentFidelity = ({ proposal }: { proposal: Proposal }) => {
  const decided = Boolean(proposal.decided_at);
  let breakIndex = -1;
  let badge = '';

  if (decided && decidedDeterministically(proposal)) {
    breakIndex = 1;
    badge = 'HARD STOP';
  } else if (decided && proposal.verdict === 'RECONFIRM') {
    breakIndex = 2;
    badge = 'CONTEXT DRIFT';
  } else if (decided && proposal.verdict === 'BLOCK') {
    breakIndex = 2;
    badge = 'PROHIBITED';
  }

  return (
    <div className="panel">
      <div className="panel-head" style={{ marginBottom: '1.5rem' }}>
        Intent Fidelity
      </div>
      <div className="fid-row">
        {NODES.map((label, i) => (
          <div key={label} style={{ display: 'contents' }}>
            <div className="fid-node">
              <div className="fid-lbl">{label}</div>
              <div className={`fid-dot ${!decided ? 'dim' : ''}`} />
            </div>
            {i < NODES.length - 1 ? (
              <div
                className={`fid-conn ${i === breakIndex ? 'broken' : ''} ${!decided ? 'dim' : ''}`}
                style={{ position: 'relative' }}
              >
                {i === breakIndex ? <div className="fid-break-badge">{badge}</div> : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};
