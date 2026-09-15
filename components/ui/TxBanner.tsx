import { explorerTx } from '@/lib/config';
import { isBusy } from '@/lib/types';
import type { TxFailureStage, TxState } from '@/lib/types';

const PHASE_TEXT: Record<string, string> = {
  estimating: 'estimating fees…',
  'awaiting-approval': 'awaiting wallet approval…',
  submitted: 'submitted, waiting to be picked up…',
  'pending-consensus': 'pending consensus…',
  decided: 'accepted',
};

const FAILURE_PREFIX: Record<TxFailureStage, string> = {
  estimating: 'fee estimation failed',
  signing: 'signature rejected',
  submitting: 'submission failed',
  consensus: 'rejected by consensus',
  execution: 'execution failed on chain',
  timeout: 'timed out waiting for a decision',
  unknown: 'failed',
};

/** Honest transaction reporting: the real phase, accepted, or failed with the real reason. */
export const TxBanner = ({ state, onDismiss }: { state: TxState; onDismiss?: () => void }) => {
  if (state.phase === 'idle') return null;

  const cls = state.phase === 'error' ? 'banner-error' : state.phase === 'decided' ? 'banner-success' : 'banner-pending';
  const busy = isBusy(state.phase);

  return (
    <div className={`banner ${cls}`} style={{ marginBottom: '1rem' }}>
      <span>
        {busy && `${state.label}: ${PHASE_TEXT[state.phase]}`}
        {state.phase === 'decided' && `${state.label}: ${PHASE_TEXT.decided}`}
        {state.phase === 'error' && `${state.label}: ${FAILURE_PREFIX[state.failureStage ?? 'unknown']}`}
      </span>
      {state.hash ? (
        <a href={explorerTx(state.hash)} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
          {state.hash.slice(0, 10)}…
        </a>
      ) : null}
      {state.error ? (
        <span style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-sans)', letterSpacing: 0 }}>
          {state.error}
        </span>
      ) : null}
      {onDismiss && !busy ? (
        <button onClick={onDismiss} style={{ marginLeft: 'auto', opacity: 0.7, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
          dismiss
        </button>
      ) : null}
    </div>
  );
};
