'use client';

import { createClient, isSuccessful } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';
import { CHAIN_ID, RPC_URL } from '@/lib/config';

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export const getInjectedProvider = (): EthereumProvider | null => {
  if (typeof window === 'undefined') return null;
  const injected = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  return injected ?? null;
};

const chainConfig = {
  ...studioDevnet,
  id: CHAIN_ID,
  rpcUrls: { default: { http: [RPC_URL] as readonly string[] } },
};

/** Read-only client. Views never require a wallet. */
export const readClient = () =>
  createClient({ chain: chainConfig as never, endpoint: RPC_URL });

/** Write client bound to the connected wallet. Signing always happens in the wallet. */
export const writeClient = (address: string) => {
  const provider = getInjectedProvider();
  if (!provider) throw new Error('No browser wallet found. Install MetaMask to sign transactions.');
  return createClient({
    chain: chainConfig as never,
    endpoint: RPC_URL,
    account: address as `0x${string}`,
    provider: provider as never,
  });
};

export { isSuccessful };
