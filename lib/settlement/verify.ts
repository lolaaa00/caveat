/**
 * Settlement verification, outside the adjudication layer.
 *
 * GenLayer decides whether an action may execute. It does not move value and does not
 * verify payments. So the payment leg is verified here, by reading the settling chain's
 * own public RPC directly — free, keyless, testnet only.
 */

import { SETTLEMENT_RAILS, type SettlementRail } from '@/lib/config';

export interface VerificationResult {
  verified: boolean;
  detail: string;
  payee: string;
  amountMinor: string;
  chainRef: string;
  /** True when the payment itself carries the authorization artifact on chain. */
  carriesAuthorization: boolean;
}

const failed = (detail: string): VerificationResult => ({
  verified: false,
  detail,
  payee: '',
  amountMinor: '0',
  chainRef: '',
  carriesAuthorization: false,
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
  payee: string,
  amountMinor: bigint,
  authorization: string,
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
  const value = BigInt(String(transaction.value ?? '0x0'));
  if (destination !== payee.toLowerCase()) {
    return failed('The transaction paid a different address.');
  }
  if (value < amountMinor) return failed('The transaction paid less than the stated amount.');

  const input = String(transaction.input ?? '0x').toLowerCase();
  const carriesAuthorization =
    authorization !== '' && input.includes(authorization.replace(/^0x/, '').toLowerCase());

  return {
    verified: true,
    detail: `Confirmed in block ${BigInt(String(receipt.blockNumber)).toString()}`,
    payee: destination,
    amountMinor: value.toString(),
    chainRef: BigInt(String(receipt.blockNumber)).toString(),
    carriesAuthorization,
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
    return {
      verified: true,
      detail: `Finalized transfer of ${lamports.toString()} lamports`,
      payee,
      amountMinor: lamports.toString(),
      chainRef: String(result.slot ?? ''),
      carriesAuthorization: false,
    };
  }

  return failed('No matching transfer to the stated payee.');
};

export const verifySettlement = async (
  rail: SettlementRail,
  txHash: string,
  payee: string,
  amountMinor: string,
  authorization: string,
): Promise<VerificationResult> => {
  try {
    const amount = BigInt(amountMinor);
    return rail === 'sepolia'
      ? await verifySepolia(txHash, payee, amount, authorization)
      : await verifySolanaDevnet(txHash, payee, amount);
  } catch (error) {
    // Never report a payment as verified because the check itself failed.
    return failed(
      error instanceof Error
        ? `Could not verify: ${error.message}`
        : 'Could not reach the settlement RPC.',
    );
  }
};
