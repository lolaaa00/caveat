'use client';

import { CONTRACT_ADDRESS } from '@/lib/config';
import type { Mandate, Proposal, TxFailureStage, TxPhase } from '@/lib/types';
import { isSuccessful, readClient, writeClient } from './client';

/** A phase reporter callback. Optional everywhere — omitting it changes nothing about
 * what a call does, only whether its real progress is surfaced to the UI. */
export type PhaseReporter = (phase: TxPhase) => void;

class TxStageError extends Error {
  failureStage: TxFailureStage;
  constructor(message: string, failureStage: TxFailureStage, cause?: unknown) {
    super(message);
    this.failureStage = failureStage;
    this.cause = cause;
  }
}

/**
 * EIP-1193 defines 4001 for a user-rejected request; wallets also commonly phrase it as
 * text ("User rejected", "user denied ..."). Distinguishing this from a genuine RPC/
 * submission failure is the difference between "you said no" and "something broke".
 */
const isUserRejection = (error: unknown): boolean => {
  const code = (error as { code?: number })?.code;
  if (code === 4001) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /user rejected|user denied|rejected the request/i.test(message);
};

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
  /server busy|execution slots|rate limit|too many requests|429|502|503|504|gateway|timed?[ -]?out|econnreset|failed to fetch|fetch failed|network ?error|load failed/i;

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

/**
 * The canonical authorization artifact for a consumed proposal, recomputed by the
 * contract itself from its own state — never trusted from a client cache or from a
 * value a wallet happened to return earlier. Empty string if the approval was never
 * consumed. This is the only value settlement verification may bind a payment against.
 */
export const getAuthorizationArtifact = async (proposalId: string): Promise<string> => {
  const raw = await read('authorization_artifact', [proposalId]);
  return typeof raw === 'string' ? raw : '';
};

// At most this many reads in flight at once. Studio Next's shared execution pool is
// small (8 slots at last check); a dashboard with dozens of mandates firing every read
// simultaneously is exactly the load pattern that saturates it for every other request
// on the network too, not just ours.
const READ_CONCURRENCY = 4;

// Studio Next's observed limit is 30 gen_call requests per minute — not per contract,
// per caller. A dashboard read is list_mandates (1) + one get_mandate per mandate, plus
// the same shape for proposals; with enough demo history that alone exceeds the budget
// before anything else on the page reads at all. Bounding each list to the most recent
// N ids (ids are creation-ordered, so the tail is the most recent) keeps total dashboard
// reads well under budget regardless of how much history the contract accumulates over
// the life of the demo, at the cost of the topline counts reflecting recent activity
// rather than the contract's entire history.
const MAX_DASHBOARD_MANDATES = 15;
const MAX_DASHBOARD_PROPOSALS = 12;

const recent = <T,>(ids: T[], max: number): T[] => ids.slice(Math.max(0, ids.length - max));

export interface BoundedList<T> {
  records: T[];
  /** Total ids on chain, before the recency cap was applied. */
  total: number;
}

export const getMandates = async (): Promise<BoundedList<Mandate>> => {
  const allIds = await listMandateIds();
  const ids = recent(allIds, MAX_DASHBOARD_MANDATES);
  const records = await mapWithConcurrency(ids, READ_CONCURRENCY, (id) => getMandate(id));
  return { records: records.filter((r): r is Mandate => r !== null), total: allIds.length };
};

export const getProposals = async (): Promise<BoundedList<Proposal>> => {
  const allIds = await listProposalIds();
  const ids = recent(allIds, MAX_DASHBOARD_PROPOSALS);
  const records = await mapWithConcurrency(ids, READ_CONCURRENCY, (id) => getProposal(id));
  return { records: records.filter((r): r is Proposal => r !== null), total: allIds.length };
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
 *
 * `onPhase` reports real progress boundaries (see TxPhase) — it's optional and never
 * changes behavior, only whether the UI can show more than "pending". Signing and
 * submission are one call from this SDK's perspective (`writeContract` blocks until
 * both happen), so 'awaiting-approval' and 'submitted' bound that one call rather than
 * being separately observed mid-call.
 */
export const send = async (
  sender: string,
  functionName: string,
  args: unknown[] = [],
  onPhase?: PhaseReporter,
): Promise<WriteResult> => {
  const client = writeClient(sender);

  onPhase?.('estimating');
  let estimate: Awaited<ReturnType<typeof client.estimateTransactionFees>>;
  try {
    estimate = await withRetry(() => client.estimateTransactionFees());
  } catch (error) {
    throw new TxStageError(
      error instanceof Error ? error.message : 'Fee estimation failed.',
      'estimating',
      error,
    );
  }
  const fees: Record<string, unknown> = {
    distribution: estimate.distribution,
    feeValue: estimate.feeValue,
  };
  if (estimate.messageAllocations) fees.messageAllocations = estimate.messageAllocations;

  // The client is already bound to the connected wallet, which is what signs. Signing
  // itself is never retried — only the RPC round trip that submits the already-signed
  // transaction, so a transient gateway error can't prompt the wallet twice.
  onPhase?.('awaiting-approval');
  let hash: string;
  try {
    hash = (await withRetry(() =>
      client.writeContract({
        address: address(),
        functionName,
        args: args as never[],
        fees: fees as never,
      }),
    )) as string;
  } catch (error) {
    throw new TxStageError(
      error instanceof Error ? error.message : 'The wallet did not submit the transaction.',
      isUserRejection(error) ? 'signing' : 'submitting',
      error,
    );
  }
  onPhase?.('submitted');

  // evaluate_proposal in particular does real non-deterministic work under consensus —
  // live web retrieval and an LLM judgement across validators — which genuinely takes
  // longer than a plain state write, on top of whatever transient RPC hiccups occur
  // while polling. Both the poll budget and the retry wrapper account for that.
  onPhase?.('pending-consensus');
  let receipt: Awaited<ReturnType<typeof client.waitForTransactionReceipt>>;
  try {
    receipt = await withRetry(
      () =>
        client.waitForTransactionReceipt({
          hash: hash as never,
          waitUntil: 'decided',
          interval: 3000,
          retries: 60,
        }),
      3,
    );
  } catch (error) {
    throw new TxStageError(
      error instanceof Error ? error.message : 'Timed out waiting for a consensus decision.',
      'timeout',
      error,
    );
  }

  const outcome = (receipt as { lifecycle?: { outcome?: string } }).lifecycle?.outcome;
  if (outcome && outcome !== 'accepted' && outcome !== 'finalized') {
    throw new TxStageError(
      `${functionName} was not accepted by consensus (outcome: ${outcome}).`,
      'consensus',
    );
  }
  if (!isSuccessful(receipt)) {
    throw new TxStageError(
      `${functionName} reached consensus but its execution failed on chain.`,
      'execution',
    );
  }

  onPhase?.('decided');
  return { hash, returned: leaderReturn(receipt) };
};

const leaderReturn = (receipt: unknown): unknown => {
  const consensus = (receipt as { consensus_data?: { leader_receipt?: unknown } }).consensus_data;
  const leader = consensus?.leader_receipt;
  const first = Array.isArray(leader) ? leader[0] : leader;
  if (first && typeof first === 'object') {
    const record = first as Record<string, unknown>;
    const raw = record.result ?? record.returned ?? record.return_value ?? null;
    return unwrapGenVMReturn(raw);
  }
  return null;
};

/**
 * GenVM's leader receipt doesn't hand back a plain value for a write's return: it's
 * `{status, payload: {raw, readable}}`, where `readable` is a JSON-encoded rendering of
 * the actual return (e.g. `"0x…"` — a quoted string — for a str return). Without this,
 * a caller checking `typeof returned === 'string'` never matches, silently discarding a
 * real return value like the authorization artifact from consume_approval.
 */
const unwrapGenVMReturn = (value: unknown): unknown => {
  if (value && typeof value === 'object' && 'payload' in (value as Record<string, unknown>)) {
    const payload = (value as Record<string, unknown>).payload;
    if (payload && typeof payload === 'object') {
      const readable = (payload as Record<string, unknown>).readable;
      if (typeof readable === 'string') {
        try {
          return JSON.parse(readable);
        } catch {
          return readable;
        }
      }
    }
  }
  return value;
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

export const createMandate = (
  sender: string,
  input: CreateMandateInput,
  onPhase?: PhaseReporter,
) =>
  send(
    sender,
    'create_mandate',
    [
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
    ],
    onPhase,
  );

export const activateMandate = (sender: string, mandateId: string, onPhase?: PhaseReporter) =>
  send(sender, 'activate_mandate', [mandateId], onPhase);

export const revokeMandate = (sender: string, mandateId: string, onPhase?: PhaseReporter) =>
  send(sender, 'revoke_mandate', [mandateId], onPhase);

export const submitProposal = (
  sender: string,
  mandateId: string,
  payloadJson: string,
  summary: string,
  onPhase?: PhaseReporter,
) => send(sender, 'submit_proposal', [mandateId, payloadJson, summary], onPhase);

export const evaluateProposal = (sender: string, proposalId: string, onPhase?: PhaseReporter) =>
  send(sender, 'evaluate_proposal', [proposalId], onPhase);

export const reconfirm = (sender: string, proposalId: string, onPhase?: PhaseReporter) =>
  send(sender, 'reconfirm', [proposalId], onPhase);

export const reject = (sender: string, proposalId: string, onPhase?: PhaseReporter) =>
  send(sender, 'reject', [proposalId], onPhase);

export const consumeApproval = (sender: string, proposalId: string, onPhase?: PhaseReporter) =>
  send(sender, 'consume_approval', [proposalId], onPhase);
