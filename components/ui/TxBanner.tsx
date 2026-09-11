import { explorerTx } from '@/lib/config';
import type { TxState } from '@/lib/types';

/** Honest transaction reporting: pending, accepted, or failed with the real reason. */
export const TxBanner = ({ state, onDismiss }: { state: TxState; onDismiss?: () => void }) => {
  if (state.phase === 'idle') return null;

  const cls =
    state.phase === 'error' ? 'banner-error' : state.phase === 'success' ? 'banner-success' : 'banner-pending';

  return (
    <div className={`banner ${cls}`} style={{ marginBottom: '1rem' }}>
      <span>
        {state.phase === 'pending' && `${state.label} — awaiting consensus…`}
        {state.phase === 'success' && `${state.label} — accepted`}
        {state.phase === 'error' && `${state.label} — failed`}
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
      {onDismiss && state.phase !== 'pending' ? (
        <button onClick={onDismiss} style={{ marginLeft: 'auto', opacity: 0.7, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
          dismiss
        </button>
      ) : null}
    </div>
  );
};
