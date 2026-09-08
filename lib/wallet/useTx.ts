'use client';

import { useCallback, useState } from 'react';
import type { TxState } from '@/lib/types';

/**
 * Tracks one on-chain operation through idle -> pending -> success | error.
 * Nothing here ever reports success on its own: the underlying call only resolves
 * once consensus accepted the transaction and its execution succeeded.
 */
export const useTx = () => {
  const [state, setState] = useState<TxState>({ phase: 'idle' });

  const run = useCallback(
    async <T,>(label: string, action: () => Promise<T>): Promise<T | null> => {
      setState({ phase: 'pending', label });
      try {
        const result = await action();
        const hash =
          result && typeof result === 'object' && 'hash' in result
            ? String((result as { hash: unknown }).hash)
            : undefined;
        setState({ phase: 'success', label, hash });
        return result;
      } catch (error) {
        setState({
          phase: 'error',
          label,
          error: error instanceof Error ? error.message : 'The transaction failed.',
        });
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => setState({ phase: 'idle' }), []);

  return { state, run, reset };
};
