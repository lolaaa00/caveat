import { explorerTx } from '@/lib/config';
import type { TxState } from '@/lib/types';

/** Honest transaction reporting: pending, accepted, or failed with the real reason. */
export const TxBanner = ({ state, onDismiss }: { state: TxState; onDismiss?: () => void }) => {
  if (state.phase === 'idle') return null;

  const tone =
    state.phase === 'error'
      ? 'border-block/60 bg-block-dim text-block'
      : state.phase === 'success'
        ? 'border-execute/60 bg-execute-dim text-execute'
        : 'border-signal/60 bg-signal/10 text-signal';

  return (
    <div className={`mb-4 flex flex-wrap items-center gap-3 border px-4 py-2.5 ${tone}`}>
      <span className="datum text-[11px] tracking-[0.1em] uppercase">
        {state.phase === 'pending' && `${state.label} — awaiting consensus…`}
        {state.phase === 'success' && `${state.label} — accepted`}
        {state.phase === 'error' && `${state.label} — failed`}
      </span>
      {state.hash ? (
        <a
          href={explorerTx(state.hash)}
          target="_blank"
          rel="noreferrer"
          className="datum text-[11px] underline"
        >
          {state.hash.slice(0, 10)}…
        </a>
      ) : null}
      {state.error ? <span className="text-[12px] text-ink-dim">{state.error}</span> : null}
      {onDismiss && state.phase !== 'pending' ? (
        <button onClick={onDismiss} className="datum ml-auto text-[11px] uppercase opacity-70">
          dismiss
        </button>
      ) : null}
    </div>
  );
};
