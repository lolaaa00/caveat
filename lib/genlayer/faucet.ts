'use client';

/**
 * A real GEN transfer, not Studio's `sim_fundAccount` simulator. `/api/faucet` signs and
 * submits it server-side from a dedicated wallet — that requires a private key, which
 * can never live in this client bundle, so the actual transfer happens behind the API
 * route, not here. This just calls it and surfaces the real transaction hash or the
 * real reason it was refused (most commonly: this address already claimed within the
 * cooldown window, enforced server-side so it can't be bypassed by reloading).
 */
export const fundFromFaucet = async (address: string): Promise<{ hash: string; amountGen: number }> => {
  const response = await fetch('/api/faucet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  });
  const body = (await response.json()) as { hash?: string; amountGen?: number; error?: string };
  if (!response.ok || !body.hash) {
    throw new Error(body.error || `Faucet request failed: HTTP ${response.status}`);
  }
  return { hash: body.hash, amountGen: body.amountGen ?? 1 };
};
