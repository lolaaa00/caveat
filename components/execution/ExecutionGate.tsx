'use client';

import { useEffect, useState } from 'react';
import { SETTLEMENT_RAILS, type SettlementRail } from '@/lib/config';
import * as caveat from '@/lib/genlayer/caveat';
import { payOnSepolia, returnToChain } from '@/lib/settlement/pay';
import { getAuthorization, getSettlement, putAuthorization, putSettlement } from '@/lib/settlement/store';
import { verifySettlement } from '@/lib/settlement/verify';
import type { Mandate, Proposal, Settlement } from '@/lib/types';
import { useTx } from '@/lib/wallet/useTx';
import type { useWallet } from '@/lib/wallet/useWallet';
import { Badge, Button, Panel } from '@/components/ui/primitives';
import { TxBanner } from '@/components/ui/TxBanner';

interface Props {
  proposal: Proposal;
  mandate: Mandate;
  wallet: ReturnType<typeof useWallet>;
  onChanged: () => void;
}

const same = (a: string | null, b: string) => Boolean(a) && a!.toLowerCase() === b.toLowerCase();

export const ExecutionGate = ({ proposal, mandate, wallet, onChanged }: Props) => {
  const { state, run, reset } = useTx();
  const address = wallet.address;
  const isPrincipal = same(address, mandate.principal);
  const isAgent = same(address, mandate.agent);
  const connected = wallet.status === 'ready' && Boolean(address);

  const act = async (label: string, action: () => Promise<unknown>) => {
    const result = await run(label, action);
    if (result) onChanged();
  };

  return (
    <Panel
      title="Execution gate"
      aside={
        proposal.approval_consumed ? (
          <Badge tone="neutral">one-time approval consumed</Badge>
        ) : proposal.executable ? (
          <Badge tone="execute">authorized</Badge>
        ) : (
          <Badge tone="reconfirm">locked</Badge>
        )
      }
    >
      <TxBanner state={state} onDismiss={reset} />

      {!connected ? (
        <p className="text-[13px] text-ink-faint">
          Connect the principal or agent wallet to act on this checkpoint.
        </p>
      ) : null}

      {proposal.status === 'PROPOSED' && connected ? (
        <div className="space-y-3">
          <p className="text-[13px] text-ink-dim">
            This proposal has not been through the checkpoint. Run it to obtain a verdict from
            the contract.
          </p>
          <Button
            tone="primary"
            disabled={state.phase === 'pending'}
            onClick={() =>
              void act('Run checkpoint', () =>
                caveat.evaluateProposal(address!, proposal.proposal_id),
              )
            }
          >
            Run CAVEAT checkpoint
          </Button>
        </div>
      ) : null}

      {proposal.status === 'RECONFIRM_REQUIRED' && connected ? (
        <div className="space-y-3">
          <p className="text-[13px] text-ink">
            Execution stays locked until the principal supplies fresh authorization. The contract
            will not release it, and neither will this page.
          </p>
          {isPrincipal ? (
            <div className="flex flex-wrap gap-3">
              <Button
                tone="execute"
                disabled={state.phase === 'pending'}
                onClick={() =>
                  void act('Reconfirm', () => caveat.reconfirm(address!, proposal.proposal_id))
                }
              >
                Reconfirm this action
              </Button>
              <Button
                tone="block"
                disabled={state.phase === 'pending'}
                onClick={() =>
                  void act('Reject', () => caveat.reject(address!, proposal.proposal_id))
                }
              >
                Reject
              </Button>
            </div>
          ) : (
            <p className="text-[12px] text-ink-faint">
              Only the principal ({mandate.principal.slice(0, 10)}…) can reconfirm. The connected
              wallet cannot.
            </p>
          )}
        </div>
      ) : null}

      {proposal.executable && connected ? (
        <div className="space-y-3">
          <p className="text-[13px] text-ink">
            The contract holds a single-use execution approval for this proposal. Consuming it
            returns the authorization artifact and is irreversible: a second attempt is rejected
            on chain.
          </p>
          {isAgent || isPrincipal ? (
            <Button
              tone="execute"
              disabled={state.phase === 'pending'}
              onClick={() =>
                void act('Consume approval', async () => {
                  const result = await caveat.consumeApproval(address!, proposal.proposal_id);
                  if (typeof result.returned === 'string' && result.returned.startsWith('0x')) {
                    putAuthorization(proposal.proposal_id, result.returned);
                  }
                  return result;
                })
              }
            >
              Consume execution approval
            </Button>
          ) : (
            <p className="text-[12px] text-ink-faint">
              Only the mandated agent or the principal can consume this approval.
            </p>
          )}
        </div>
      ) : null}

      {proposal.approval_consumed ? (
        <SettlementSection
          proposal={proposal}
          connected={connected}
          address={address}
          allowed={isAgent || isPrincipal}
          walletChainIdHex={wallet.chainId ? `0x${wallet.chainId.toString(16)}` : null}
        />
      ) : null}

      {proposal.status === 'BLOCKED' ? (
        <p className="text-[13px] text-ink-dim">
          No execution path exists for a blocked proposal. The agent must propose something else.
        </p>
      ) : null}
    </Panel>
  );
};

/**
 * The payment leg. Deliberately outside the Intelligent Contract: GenLayer adjudicates
 * whether the action may execute, and does not move or verify value. The payment is
 * signed by the principal's own wallet and verified here against the settling chain's
 * own public RPC.
 */
const SettlementSection = ({
  proposal,
  connected,
  address,
  allowed,
  walletChainIdHex,
}: {
  proposal: Proposal;
  connected: boolean;
  address: string | null;
  allowed: boolean;
  walletChainIdHex: string | null;
}) => {
  const { state, run, reset } = useTx();
  const [rail, setRail] = useState<SettlementRail>('sepolia');
  const [txHash, setTxHash] = useState('');
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [record, setRecord] = useState<Settlement | null>(null);
  const [authorization, setAuthorization] = useState('');

  useEffect(() => {
    setRecord(getSettlement(proposal.proposal_id));
    setAuthorization(getAuthorization(proposal.proposal_id));
  }, [proposal.proposal_id]);

  const config = SETTLEMENT_RAILS[rail];

  const verifyAndStore = async (hash: string, chain: SettlementRail) => {
    const result = await verifySettlement(chain, hash, payee, amount, authorization);
    if (!result.verified) throw new Error(result.detail);
    const stored: Settlement = {
      proposalId: proposal.proposal_id,
      chain,
      txHash: hash,
      payee: result.payee,
      amountMinor: result.amountMinor,
      authorization,
      verified: true,
      detail: result.detail + (result.carriesAuthorization ? ', carries the authorization' : ''),
      chainRef: result.chainRef,
      recordedAt: Math.floor(Date.now() / 1000),
    };
    putSettlement(stored);
    setRecord(stored);
    return stored;
  };

  if (record) {
    const recorded = SETTLEMENT_RAILS[record.chain as SettlementRail];
    return (
      <div className="rule mt-5 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="label">Settlement — outside the adjudication layer</div>
          <Badge tone="execute">verified on {recorded?.label ?? record.chain}</Badge>
        </div>
        <p className="mt-2 text-[13px] text-ink">
          {record.amountMinor} minor units to <span className="datum">{record.payee}</span> —{' '}
          {record.detail}
        </p>
        {recorded ? (
          <a
            href={recorded.explorerTx(record.txHash)}
            target="_blank"
            rel="noreferrer"
            className="datum mt-2 inline-block text-[11px] break-all text-signal hover:underline"
          >
            {record.txHash}
          </a>
        ) : null}
        <p className="mt-2 text-[11px] text-ink-faint">
          Verified against {recorded?.label ?? record.chain} directly. The contract holds no
          payment state: it decided, and this executed behind the gate.
        </p>
      </div>
    );
  }

  return (
    <div className="rule mt-5 pt-4">
      <div className="label mb-2">Settlement — outside the adjudication layer</div>
      <p className="mb-3 text-[13px] text-ink-dim">
        The approval is consumed, so the action may now execute. GenLayer decided it; it does
        not settle it. Pay from your own wallet on a testnet — the payment carries the
        authorization artifact — and it is verified here against the settling chain.
      </p>

      {authorization ? (
        <div className="mb-3">
          <div className="label mb-1">Authorization artifact</div>
          <p className="datum text-[11px] break-all text-ink-faint">{authorization}</p>
        </div>
      ) : (
        <p className="mb-3 text-[12px] text-reconfirm">
          The authorization artifact from this browser is not available (it is returned when the
          approval is consumed). Payment can still be verified, but it will not carry the link
          to the decision.
        </p>
      )}

      <TxBanner state={state} onDismiss={reset} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Rail</span>
          <select
            value={rail}
            onChange={(event) => setRail(event.target.value as SettlementRail)}
            className="datum mt-1 w-full border border-line bg-surface px-2.5 py-2 text-[12px] text-ink"
          >
            {Object.entries(SETTLEMENT_RAILS).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Amount ({config.symbol}, minor units)</span>
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ''))}
            placeholder={rail === 'sepolia' ? '10000000000000000' : '25000000'}
            className="datum mt-1 w-full border border-line bg-surface px-2.5 py-2 text-[12px] text-ink"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Payee</span>
          <input
            value={payee}
            onChange={(event) => setPayee(event.target.value.trim())}
            placeholder={rail === 'sepolia' ? '0x…' : 'base58 address'}
            className="datum mt-1 w-full border border-line bg-surface px-2.5 py-2 text-[12px] text-ink"
          />
        </label>
      </div>

      {config.walletPayable ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            tone="primary"
            disabled={!connected || !allowed || state.phase === 'pending' || !payee || !amount}
            onClick={() =>
              void run('Pay and verify', async () => {
                const { txHash: sent, previousChainIdHex } = await payOnSepolia(
                  address!,
                  payee,
                  amount,
                  authorization,
                );
                setTxHash(sent);
                try {
                  return await verifyAndStore(sent, 'sepolia');
                } finally {
                  // Put the wallet back on the GenLayer chain so the console keeps working.
                  await returnToChain(walletChainIdHex ?? '0xf22d');
                }
              })
            }
          >
            Pay {config.symbol} from my wallet
          </Button>
          <a
            href={config.faucet}
            target="_blank"
            rel="noreferrer"
            className="datum text-[11px] text-signal hover:underline"
          >
            faucet
          </a>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-ink-faint">
          {config.label} is signed in a Solana wallet such as Phantom. Send the transfer there,
          then paste the signature below.{' '}
          <a
            href={config.faucet}
            target="_blank"
            rel="noreferrer"
            className="text-signal hover:underline"
          >
            faucet
          </a>
        </p>
      )}

      <div className="rule mt-4 pt-4">
        <label className="block">
          <span className="label">
            Already paid? Paste the transaction hash or signature to verify it
          </span>
          <input
            value={txHash}
            onChange={(event) => setTxHash(event.target.value.trim())}
            placeholder={rail === 'sepolia' ? '0x…' : 'signature'}
            className="datum mt-1 w-full border border-line bg-surface px-2.5 py-2 text-[12px] text-ink"
          />
        </label>
        <div className="mt-3">
          <Button
            disabled={state.phase === 'pending' || !txHash || !payee || !amount}
            onClick={() => void run('Verify payment', () => verifyAndStore(txHash, rail))}
          >
            Verify payment
          </Button>
        </div>
      </div>
    </div>
  );
};
