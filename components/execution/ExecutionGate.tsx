'use client';

import { useState } from 'react';
import { SETTLEMENT_RAILS, type SettlementRail } from '@/lib/config';
import * as caveat from '@/lib/genlayer/caveat';
import type { Mandate, Proposal } from '@/lib/types';
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
            The contract holds a single-use execution approval for this proposal. Consuming it is
            irreversible: a second attempt is rejected on chain.
          </p>
          {isAgent || isPrincipal ? (
            <Button
              tone="execute"
              disabled={state.phase === 'pending'}
              onClick={() =>
                void act('Consume approval', () =>
                  caveat.consumeApproval(address!, proposal.proposal_id),
                )
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
          onChanged={onChanged}
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

const SettlementSection = ({
  proposal,
  connected,
  address,
  allowed,
  onChanged,
}: {
  proposal: Proposal;
  connected: boolean;
  address: string | null;
  allowed: boolean;
  onChanged: () => void;
}) => {
  const { state, run, reset } = useTx();
  const [rail, setRail] = useState<SettlementRail>('sepolia');
  const [txHash, setTxHash] = useState('');
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');

  if (proposal.settlement) {
    const config = SETTLEMENT_RAILS[proposal.settlement.chain as SettlementRail];
    return (
      <div className="rule mt-5 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="label">Settlement</div>
          <Badge tone="execute">verified on {config?.label ?? proposal.settlement.chain}</Badge>
        </div>
        <p className="mt-2 text-[13px] text-ink">
          {proposal.settlement.amount_minor} {config ? 'minor units' : ''} to{' '}
          <span className="datum">{proposal.settlement.payee}</span> — {proposal.settlement.detail}
        </p>
        {config ? (
          <a
            href={config.explorerTx(proposal.settlement.tx_hash)}
            target="_blank"
            rel="noreferrer"
            className="datum mt-2 inline-block text-[11px] break-all text-signal hover:underline"
          >
            {proposal.settlement.tx_hash}
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rule mt-5 pt-4">
      <div className="label mb-2">Settlement</div>
      <p className="mb-3 text-[13px] text-ink-dim">
        The approval is consumed, so a payment may now be recorded. Pay from your own wallet on a
        testnet, then submit the transaction hash: the contract verifies it against a public RPC
        and refuses anything it cannot confirm.
      </p>
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
          <span className="label">Amount ({SETTLEMENT_RAILS[rail].symbol}, minor units)</span>
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
        <label className="block sm:col-span-2">
          <span className="label">Transaction hash / signature</span>
          <input
            value={txHash}
            onChange={(event) => setTxHash(event.target.value.trim())}
            placeholder={rail === 'sepolia' ? '0x…' : 'signature'}
            className="datum mt-1 w-full border border-line bg-surface px-2.5 py-2 text-[12px] text-ink"
          />
        </label>
      </div>

      <div className="mt-3">
        <Button
          tone="primary"
          disabled={
            !connected || !allowed || state.phase === 'pending' || !txHash || !payee || !amount
          }
          onClick={() =>
            void run('Record settlement', async () => {
              const result = await caveat.recordSettlement(
                address!,
                proposal.proposal_id,
                rail,
                txHash,
                payee,
                amount,
              );
              onChanged();
              return result;
            })
          }
        >
          Verify and record settlement
        </Button>
      </div>
    </div>
  );
};
