'use client';

import { useCallback, useEffect, useState } from 'react';
import { isConfigured } from '@/lib/config';

/**
 * Loads authoritative state from the Intelligent Contract. There is no cache layer and
 * no local mirror: what the console shows is what the contract returned.
 */
export const useChainData = <T,>(load: () => Promise<T>, deps: unknown[] = []) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isConfigured()) {
      setError('NEXT_PUBLIC_CAVEAT_CONTRACT_ADDRESS is not set. Run `npm run deploy` first.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await load());
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Could not read from the contract.',
      );
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
};
