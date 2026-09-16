import { NextResponse } from 'next/server';
import { createAccount, createClient } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';
import { Redis } from '@upstash/redis';
import { CHAIN_ID, RPC_URL } from '@/lib/config';

/**
 * A real, server-signed GEN transfer from a dedicated throwaway wallet — not Studio's
 * `sim_fundAccount` simulator. That call can never happen from the browser: it needs a
 * private key, and a private key in client-side JS is extractable by anyone who opens
 * dev tools. This route is the one place that key is ever loaded, from a server-only
 * env var (no NEXT_PUBLIC_ prefix), and it never appears in any response.
 *
 * The 48h-per-address cooldown is enforced in Upstash Redis, not client state — reloading
 * the page or clearing localStorage cannot bypass it.
 */

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

const FAUCET_AMOUNT_GEN = Number(process.env.FAUCET_AMOUNT_GEN ?? '1');
const COOLDOWN_HOURS = Number(process.env.FAUCET_COOLDOWN_HOURS ?? '48');
const COOLDOWN_SECONDS = COOLDOWN_HOURS * 60 * 60;
const AMOUNT_WEI = BigInt(Math.round(FAUCET_AMOUNT_GEN * 1e18));

// Vercel's Redis/Upstash integration names its env vars KV_REST_API_URL/TOKEN, not the
// UPSTASH_REDIS_REST_* names Redis.fromEnv() looks for — construct explicitly instead.
const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
});

const chainConfig = {
  ...studioDevnet,
  id: CHAIN_ID,
  rpcUrls: { default: { http: [RPC_URL] as readonly string[] } },
};

export async function POST(request: Request) {
  let address: string;
  try {
    const body = (await request.json()) as { address?: string };
    address = (body.address ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!ADDRESS_PATTERN.test(address)) {
    return NextResponse.json({ error: 'Not a valid address.' }, { status: 400 });
  }

  const privateKey = process.env.FAUCET_PRIVATE_KEY;
  if (!privateKey) {
    return NextResponse.json({ error: 'Faucet is not configured on this deployment.' }, { status: 503 });
  }

  const cooldownKey = `faucet:${address.toLowerCase()}`;
  const ttl = await redis.ttl(cooldownKey);
  if (ttl && ttl > 0) {
    const hours = Math.ceil(ttl / 3600);
    return NextResponse.json(
      { error: `Already funded. Try again in about ${hours}h.` },
      { status: 429 },
    );
  }

  try {
    const account = createAccount(privateKey as `0x${string}`);
    const client = createClient({ chain: chainConfig as never, endpoint: RPC_URL, account });

    const hash = await client.sendTransaction({
      to: address as `0x${string}`,
      value: AMOUNT_WEI,
    } as never);

    // Reserve the cooldown only after a real, submitted transfer — a failed submission
    // must not lock the address out for 48h with nothing to show for it.
    await redis.set(cooldownKey, String(hash), { ex: COOLDOWN_SECONDS });

    return NextResponse.json({ hash, amountGen: FAUCET_AMOUNT_GEN });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Faucet transfer failed.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
