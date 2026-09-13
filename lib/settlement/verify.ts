/**
 * Settlement verification, outside the adjudication layer.
 *
 * GenLayer decides whether an action may execute. It does not move value and does not
 * verify payments. So the payment leg is verified here, by reading the settling chain's
 * own public RPC directly — free, keyless, testnet only.
 *
 * `verified: true` is a claim that a specific external transaction executed the specific
 * decision CAVEAT authorized. That claim requires binding, not just a plausible-looking
 * payment: the transaction must carry the canonical authorization artifact — fetched
 * fresh from the contract's own `authorization_artifact` view, never trusted from a
 * client-supplied value — and its sender, destination, asset, and amount must match what
 * the proposal and mandate actually specify. A rail that cannot establish that binding
 * (Solana, here) must never be reported as authorized execution: it is at most a
 * confirmed, unverified external payment, and is labeled as such.
 */

import { getAuthorizationArtifact } from '@/lib/genlayer/caveat';
import { SETTLEMENT_RAILS, type SettlementRail } from '@/lib/config';

export interface VerificationResult {
  /** The transfer itself was found, succeeded on chain, and met the stated payee/amount. */
  paymentConfirmed: boolean;
  /**
   * `paymentConfirmed` AND cryptographically bound to this proposal's authorization
   * artifact AND sent by a wallet the mandate actually authorizes to act. Only this
   * flag may be described to a user as "CAVEAT authorized this execution."
   */
  authorizedExecution: boolean;
  detail: string;
  payee: string;
  amountMinor: string;
  chainRef: string;
}

const failed = (detail: string): VerificationResult => ({
  paymentConfirmed: false,
  authorizedExecution: false,
  detail,
  payee: '',
  amountMinor: '0',
  chainRef: '',
});

const rpc = async (url: string, body: unknown): Promise<Record<string, unknown>> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
};

const verifySepolia = async (
  txHash: string,
  expectedSenders: string[],
  payee: string,
  amountMinor: bigint,
  artifact: string,
): Promise<VerificationResult> => {
  const url = SETTLEMENT_RAILS.sepolia.rpcUrl;
  const [receiptResponse, txResponse] = await Promise.all([
    rpc(url, { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
    rpc(url, { jsonrpc: '2.0', id: 2, method: 'eth_getTransactionByHash', params: [txHash] }),
  ]);

  const receipt = receiptResponse.result as Record<string, unknown> | null;
  const transaction = txResponse.result as Record<string, unknown> | null;

  if (!receipt || !transaction) return failed('Transaction not found on Sepolia.');
  if (String(receipt.status ?? '').toLowerCase() !== '0x1') {
    return failed('The transaction did not succeed on chain.');
  }
  if (!receipt.blockNumber) return failed('The transaction is not yet in a block.');

  const destination = String(transaction.to ?? '').toLowerCase();
  const sender = String(transaction.from ?? '').toLowerCase();
  const value = BigInt(String(transaction.value ?? '0x0'));

  if (destination !== payee.toLowerCase()) {
    return failed('The transaction paid a different address than the stated payee.');
  }
  if (value < amountMinor) return failed('The transaction paid less than the stated amount.');

  const paymentConfirmed = true;
  const chainRef = BigInt(String(receipt.blockNumber)).toString();

  if (!expectedSenders.some((addr) => addr.toLowerCase() === sender)) {
    return {
      paymentConfirmed,
      authorizedExecution: false,
      detail: `Confirmed in block ${chainRef}, but sent from a wallet the mandate does not authorize (neither the agent nor the principal).`,
      payee: destination,
      amountMinor: value.toString(),
      chainRef,
    };
  }

  if (artifact === '') {
    return {
      paymentConfirmed,
      authorizedExecution: false,
      detail: `Confirmed in block ${chainRef}, but this proposal's approval has not been consumed on chain — there is no authorization artifact to bind against.`,
      payee: destination,
      amountMinor: value.toString(),
      chainRef,
    };
  }

  const input = String(transaction.input ?? '0x').toLowerCase();
  const carriesArtifact = input.includes(artifact.replace(/^0x/, '').toLowerCase());

  if (!carriesArtifact) {
    return {
      paymentConfirmed,
      authorizedExecution: false,
      detail: `Confirmed in block ${chainRef}, but its calldata does not carry the exact authorization artifact for this decision — it cannot be treated as authorized execution.`,
      payee: destination,
      amountMinor: value.toString(),
      chainRef,
    };
  }

  return {
    paymentConfirmed,
    authorizedExecution: true,
    detail: `Confirmed in block ${chainRef}, sent by an authorized wallet, carrying the exact authorization artifact for this decision.`,
    payee: destination,
    amountMinor: value.toString(),
    chainRef,
  };
};

const verifySolanaDevnet = async (
  signature: string,
  payee: string,
  amountMinor: bigint,
): Promise<VerificationResult> => {
  const url = SETTLEMENT_RAILS['solana-devnet'].rpcUrl;
  const response = await rpc(url, {
    jsonrpc: '2.0',
    id: 1,
    method: 'getTransaction',
    params: [
      signature,
      { encoding: 'jsonParsed', commitment: 'finalized', maxSupportedTransactionVersion: 0 },
    ],
  });

  const result = response.result as Record<string, unknown> | null;
  if (!result) return failed('Transaction not found, or not finalized yet.');

  const meta = result.meta as Record<string, unknown> | undefined;
  if (!meta) return failed('Transaction metadata unavailable.');
  if (meta.err !== null && meta.err !== undefined) return failed('The transaction failed on chain.');

  const message = (result.transaction as Record<string, unknown> | undefined)?.message as
    | Record<string, unknown>
    | undefined;
  const instructions = message?.instructions as Record<string, unknown>[] | undefined;
  if (!Array.isArray(instructions)) return failed('Transaction instructions unavailable.');

  for (const instruction of instructions) {
    const parsed = instruction.parsed as Record<string, unknown> | undefined;
    if (!parsed || parsed.type !== 'transfer') continue;
    const info = parsed.info as Record<string, unknown> | undefined;
    if (!info || String(info.destination ?? '') !== payee) continue;
    const lamports = BigInt(String(info.lamports ?? '0'));
    if (lamports < amountMinor) {
      return failed('The transfer paid less than the stated amount.');
    }
    // This rail has no mechanism to carry the authorization artifact (no calldata
    // field), so no on-chain link back to the CAVEAT decision can ever be established
    // here. Reporting this as authorized execution would be a claim this check cannot
    // support — so it never does, regardless of how the payment itself looks.
    return {
      paymentConfirmed: true,
      authorizedExecution: false,
      detail: `Finalized transfer of ${lamports.toString()} lamports — an unverified external payment. This rail cannot carry the authorization artifact, so it cannot be bound to this decision.`,
      payee,
      amountMinor: lamports.toString(),
      chainRef: String(result.slot ?? ''),
    };
  }

  return failed('No matching transfer to the stated payee.');
};

export const verifySettlement = async (
  rail: SettlementRail,
  txHash: string,
  proposalId: string,
  expectedSenders: string[],
  payee: string,
  amountMinor: string,
): Promise<VerificationResult> => {
  try {
    const amount = BigInt(amountMinor);
    if (rail === 'sepolia') {
      const artifact = await getAuthorizationArtifact(proposalId);
      return await verifySepolia(txHash, expectedSenders, payee, amount, artifact);
    }
    return await verifySolanaDevnet(txHash, payee, amount);
  } catch (error) {
    // Never report a payment as verified because the check itself failed.
    return failed(
      error instanceof Error
        ? `Could not verify: ${error.message}`
        : 'Could not reach the settlement RPC.',
    );
  }
};
