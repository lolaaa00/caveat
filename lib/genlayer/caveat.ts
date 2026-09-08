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

// ---------------------------------------------------------------------------- reads

const read = async (functionName: string, args: unknown[] = []) =>
  readClient().readContract({ address: address(), functionName, args: args as never[] });

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

export const getMandates = async (): Promise<Mandate[]> => {
  const ids = await listMandateIds();
  const records = await Promise.all(ids.map((id) => getMandate(id)));
  return records.filter((record): record is Mandate => record !== null);
};

export const getProposals = async (): Promise<Proposal[]> => {
  const ids = await listProposalIds();
  const records = await Promise.all(ids.map((id) => getProposal(id)));
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
  const estimate = await client.estimateTransactionFees();
  const fees: Record<string, unknown> = {
    distribution: estimate.distribution,
    feeValue: estimate.feeValue,
  };
  if (estimate.messageAllocations) fees.messageAllocations = estimate.messageAllocations;

  // The client is already bound to the connected wallet, which is what signs.
  const hash = (await client.writeContract({
    address: address(),
    functionName,
    args: args as never[],
    fees: fees as never,
  })) as string;

  const receipt = await client.waitForTransactionReceipt({
    hash: hash as never,
    waitUntil: 'decided',
    interval: 3000,
    retries: 60,
  });

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

export const recordSettlement = (
  sender: string,
  proposalId: string,
  chain: string,
  txHash: string,
  payee: string,
  amountMinor: string,
) => send(sender, 'record_settlement', [proposalId, chain, txHash, payee, BigInt(amountMinor)]);
