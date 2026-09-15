'use client';

import { useCallback, useState } from 'react';
import type { TxFailureStage, TxPhase, TxState } from '@/lib/types';

/**
 * Tracks one on-chain operation through its real phases (see TxPhase) rather than a
 * single opaque "pending". Nothing here ever reports a decided/success state on its
 * own: the underlying call only resolves once consensus accepted the transaction and
 * its execution succeeded.
 *
 * `reportPhase` is a stable callback an action can optionally forward into a
 * `send()`-based call (e.g. `createMandate(sender, input, reportPhase)`) to surface its
 * real progress. Omitting it is harmless — the label/hash/error handling below still
 * works, it just starts at 'estimating' and jumps straight to 'decided' or 'error'.
 */
export const useTx = () => {
  const [state, setState] = useState<TxState>({ phase: 'idle' });

  const reportPhase = useCallback((phase: TxPhase) => {
    setState((prev) => ({ ...prev, phase }));
  }, []);

  const run = useCallback(
    async <T,>(label: string, action: () => Promise<T>): Promise<T | null> => {
      setState({ phase: 'estimating', label });
      try {
        const result = await action();
        const hash =
          result && typeof result === 'object' && 'hash' in result
            ? String((result as { hash: unknown }).hash)
            : undefined;
        setState({ phase: 'decided', label, hash });
        return result;
      } catch (error) {
        const failureStage =
          error instanceof Error && 'failureStage' in error
            ? ((error as Error & { failureStage?: TxFailureStage }).failureStage ?? 'unknown')
            : 'unknown';
        setState({
          phase: 'error',
          label,
          error: error instanceof Error ? error.message : 'The transaction failed.',
          failureStage,
        });
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => setState({ phase: 'idle' }), []);

  return { state, run, reset, reportPhase };
};
