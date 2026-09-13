'use client';

import { CONTRACT_ADDRESS } from '@/lib/config';
import type { Mandate, Proposal } from '@/lib/types';
import { isSuccessful, readClient, writeClient } from './client';

const address = () => {
  if (!CONTRACT_ADDRESS) {
    throw new Error(
      'NEXT_PUBLIC_CAVEAT_CONTRACT_ADDRESS is not set. Run `npm run deploy` first.',
    );
  }
  return CONTRACT_ADDRESS as `0x${string}`;
};

const asJson = <T,>(raw: unknown): T | null => {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  return JSON.parse(raw) as T;
};

/**
 * Studio Next is a shared preview devnet with a small execution pool (currently 8
 * slots). Under real traffic — several people demoing at once, or this console's own
 * dashboard firing many parallel reads — a call can transiently fail with "Server busy"
 * or a gateway timeout even though nothing is actually wrong. That is not a decision
 * failure; it is the shared testnet being momentarily saturated. Retrying with backoff
 * is honest here: no verdict is invented or assumed, the call is just asked again.
 */
const TRANSIENT_PATTERN =
  /server busy|execution slots|rate limit|too many requests|429|502|503|504|gateway|timed?[ -]?out|econnreset|fetch failed/i;

const isTransient = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_PATTERN.test(message);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === attempts - 1) throw error;
      const backoff = Math.min(800 * 2 ** attempt, 8000) + Math.random() * 300;
      await sleep(backoff);
    }
  }
  throw lastError;
}

/**
 * Runs async work over `items` with at most `limit` in flight, and a minimum spacing
 * between call starts — not just fewer calls at once, but fewer calls per second.
 *
 * Studio Next enforces "max 20 gen_call/sim_call requests per 10s, per contract
 * address" — measured directly against this contract's own rate-limit error. A pure
 * concurrency cap of 4 still bursts past that the moment each short read resolves and
 * the next one fires immediately, so every dispatch is additionally paced to keep the
 * whole batch comfortably under 20 calls per rolling 10s window even as this contract
 * accumulates more mandates and proposals over the life of the demo.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  minSpacingMs = 520,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  let lastDispatch = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      const wait = lastDispatch + minSpacingMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastDispatch = Date.now();
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------- reads

const read = async (functionName: string, args: unknown[] = []) =>
  withRetry(() =>
    readClient().readContract({ address: address(), functionName, args: args as never[] }),
  );

export const listMandateIds = async (): Promise<string[]> =>
  asJson<string[]>(await read('list_mandates')) ?? [];

export const listProposalIds = async (): Promise<string[]> =>
  asJson<string[]>(await read('list_proposals')) ?? [];

export const getMandate = async (id: string): Promise<Mandate | null> =>
  asJson<Mandate>(await read('get_mandate', [id]));

export const getProposal = async (id: string): Promise<Proposal | null> =>
  asJson<Proposal>(await read('get_proposal', [id]));

export const proposalIdsForMandate = async (mandateId: string): Promise<string[]> =>
  asJson<string[]>(await read('proposals_for_mandate', [mandateId])) ?? [];

export const isExecutable = async (proposalId: string): Promise<boolean> =>
  Boolean(await read('is_executable', [proposalId]));

// At most this many reads in flight at once. Studio Next's shared execution pool is
// small (8 slots at last check); a dashboard with dozens of mandates firing every read
// simultaneously is exactly the load pattern that saturates it for every other request
// on the network too, not just ours.
const READ_CONCURRENCY = 4;

export const getMandates = async (): Promise<Mandate[]> => {
  const ids = await listMandateIds();
  const records = await mapWithConcurrency(ids, READ_CONCURRENCY, (id) => getMandate(id));
  return records.filter((record): record is Mandate => record !== null);
};

export const getProposals = async (): Promise<Proposal[]> => {
  const ids = await listProposalIds();
  const records = await mapWithConcurrency(ids, READ_CONCURRENCY, (id) => getProposal(id));
  return records.filter((record): record is Proposal => record !== null);
};

// --------------------------------------------------------------------------- writes

export interface WriteResult {
  hash: string;
  returned: unknown;
}

/**
 * Send a write and wait for the consensus decision.
 *
 * Under Consensus v0.6 a fee quote is mandatory (a transaction without a
 * FeesDistribution is reverted) and a decided transaction can still carry a failed
 * GenVM execution, so both are checked before this resolves.
 */
export const send = async (
  sender: string,
  functionName: string,
  args: unknown[] = [],
): Promise<WriteResult> => {
  const client = writeClient(sender);
  const estimate = await withRetry(() => client.estimateTransactionFees());
  const fees: Record<string, unknown> = {
    distribution: estimate.distribution,
    feeValue: estimate.feeValue,
  };
  if (estimate.messageAllocations) fees.messageAllocations = estimate.messageAllocations;

  // The client is already bound to the connected wallet, which is what signs. Signing
  // itself is never retried — only the RPC round trip that submits the already-signed
  // transaction, so a transient gateway error can't prompt the wallet twice.
  const hash = (await withRetry(() =>
    client.writeContract({
      address: address(),
      functionName,
      args: args as never[],
      fees: fees as never,
    }),
  )) as string;

  // evaluate_proposal in particular does real non-deterministic work under consensus —
  // live web retrieval and an LLM judgement across validators — which genuinely takes
  // longer than a plain state write, on top of whatever transient RPC hiccups occur
  // while polling. Both the poll budget and the retry wrapper account for that.
  const receipt = await withRetry(
    () =>
      client.waitForTransactionReceipt({
        hash: hash as never,
        waitUntil: 'decided',
        interval: 3000,
        retries: 60,
      }),
    3,
  );

  const outcome = (receipt as { lifecycle?: { outcome?: string } }).lifecycle?.outcome;
  if (outcome && outcome !== 'accepted' && outcome !== 'finalized') {
    throw new Error(`${functionName} was not accepted by consensus (outcome: ${outcome}).`);
  }
  if (!isSuccessful(receipt)) {
    throw new Error(`${functionName} reached consensus but its execution failed on chain.`);
  }

  return { hash, returned: leaderReturn(receipt) };
};

const leaderReturn = (receipt: unknown): unknown => {
  const consensus = (receipt as { consensus_data?: { leader_receipt?: unknown } }).consensus_data;
  const leader = consensus?.leader_receipt;
  const first = Array.isArray(leader) ? leader[0] : leader;
  if (first && typeof first === 'object') {
    const record = first as Record<string, unknown>;
    return record.result ?? record.returned ?? record.return_value ?? null;
  }
  return null;
};

// ------------------------------------------------------------------ contract actions

export interface CreateMandateInput {
  agent: string;
  intentText: string;
  purposeText: string;
  actionType: string;
  hardConstraintsJson: string;
  semanticConditions: string;
  approvedSourcesJson: string;
  evidenceQuestionsJson: string;
  reconfirmPolicy: string;
  expiresAt: number;
}

export const createMandate = (sender: string, input: CreateMandateInput) =>
  send(sender, 'create_mandate', [
    input.agent,
    input.intentText,
    input.purposeText,
    input.actionType,
    input.hardConstraintsJson,
    input.semanticConditions,
    input.approvedSourcesJson,
    input.evidenceQuestionsJson,
    input.reconfirmPolicy,
    input.expiresAt,
  ]);

export const activateMandate = (sender: string, mandateId: string) =>
  send(sender, 'activate_mandate', [mandateId]);

export const revokeMandate = (sender: string, mandateId: string) =>
  send(sender, 'revoke_mandate', [mandateId]);

export const submitProposal = (
  sender: string,
  mandateId: string,
  payloadJson: string,
  summary: string,
) => send(sender, 'submit_proposal', [mandateId, payloadJson, summary]);

export const evaluateProposal = (sender: string, proposalId: string) =>
  send(sender, 'evaluate_proposal', [proposalId]);

export const reconfirm = (sender: string, proposalId: string) =>
  send(sender, 'reconfirm', [proposalId]);

export const reject = (sender: string, proposalId: string) =>
  send(sender, 'reject', [proposalId]);

export const consumeApproval = (sender: string, proposalId: string) =>
  send(sender, 'consume_approval', [proposalId]);
