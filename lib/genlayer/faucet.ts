'use client';

import { RPC_URL } from '@/lib/config';

/**
 * Studio Next's built-in faucet. `sim_fundAccount` is a plain JSON-RPC method on the
 * Studio preview network — the same call the deploy script already uses server-side to
 * fund its own testnet keys. Exposing it here removes the single biggest piece of
 * friction between a first-time visitor and actually trying the live checkpoint: without
 * it, creating a mandate needs testnet GEN the visitor has no way to get except by
 * hunting down the faucet themselves.
 *
 * Grants a fixed amount, not attacker-choosable, and only works against Studio preview
 * networks in the first place — there is nothing to abuse here beyond what the network
 * already gives away for free.
 */
const FUND_AMOUNT_WEI = '10000000000000000000'; // 10 GEN — Studio Next faucet cap

export const fundFromFaucet = async (address: string): Promise<void> => {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'sim_fundAccount',
      params: [address, FUND_AMOUNT_WEI],
    }),
  });

  if (!response.ok) {
    throw new Error(`Faucet request failed: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { error?: { message?: string } };
  if (body.error) {
    throw new Error(body.error.message || 'Faucet request was refused.');
  }
};
