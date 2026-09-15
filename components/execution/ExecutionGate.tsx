'use client';

import { useEffect, useState } from 'react';
import { SETTLEMENT_RAILS, type SettlementRail } from '@/lib/config';
import * as caveat from '@/lib/genlayer/caveat';
import { payOnSepolia, returnToChain } from '@/lib/settlement/pay';
import { getAuthorization, getSettlement, putAuthorization, putSettlement } from '@/lib/settlement/store';
import { verifySettlement } from '@/lib/settlement/verify';
import { isBusy } from '@/lib/types';
import type { Mandate, Proposal, Settlement } from '@/lib/types';
import { useTx } from '@/lib/wallet/useTx';
import type { useWallet } from '@/lib/wallet/useWallet';
import { skinFor, skinVars } from '@/lib/ui/verdict';
import { Button } from '@/components/ui/primitives';
import { TxBanner } from '@/components/ui/TxBanner';

interface Props {
  proposal: Proposal;
  mandate: Mandate;
  wallet: ReturnType<typeof useWallet>;
  onChanged: () => void;
}

const same = (a: string | null, b: string) => Boolean(a) && a!.toLowerCase() === b.toLowerCase();

export const ExecutionGate = ({ proposal, mandate, wallet, onChanged }: Props) => {
  const { state, run, reset, reportPhase } = useTx();
  const address = wallet.address;
  const isPrincipal = same(address, mandate.principal);
  const isAgent = same(address, mandate.agent);
  const connected = wallet.status === 'ready' && Boolean(address);
  const skin = skinFor(proposal.verdict);

  const act = async (label: string, action: () => Promise<unknown>) => {
    const result = await run(label, action);
    if (result) onChanged();
  };

  const status = proposal.approval_consumed
    ? 'EXECUTION GATE CLOSED'
    : proposal.executable
      ? 'EXECUTION AUTHORIZED'
      : proposal.status === 'BLOCKED'
        ? 'EXECUTION REFUSED'
        : proposal.status === 'RECONFIRM_REQUIRED'
          ? 'EXECUTION LOCKED'
          : 'AWAITING CHECKPOINT';

  const sub = proposal.approval_consumed
    ? 'Approval consumed: replay protected'
    : proposal.executable
      ? 'One-time approval: ready to consume'
      : proposal.status === 'BLOCKED'
        ? 'Contradicts the mandate: cannot be reconfirmed'
        : proposal.status === 'RECONFIRM_REQUIRED'
          ? 'Awaiting principal reconfirmation'
          : 'No verdict yet';

  return (
    <div className="gate-panel" style={skinVars(skin)}>
      <div className="gate-status">{status}</div>
      <div className="gate-sub">{sub}</div>

      <div style={{ textAlign: 'left', maxWidth: 560, margin: '0 auto' }}>
        <TxBanner state={state} onDismiss={reset} />

        {!connected ? (
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-faint)', textAlign: 'center' }}>
            Connect the principal or agent wallet to act on this checkpoint.
          </p>
        ) : null}

        {proposal.status === 'PROPOSED' && connected ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', marginBottom: '1rem' }}>
              This proposal has not been through the checkpoint. Run it to obtain a verdict from
              the contract.
            </p>
            <Button
              tone="crimson"
              disabled={isBusy(state.phase)}
              onClick={() =>
                void act('Run checkpoint', () =>
                  caveat.evaluateProposal(address!, proposal.proposal_id, reportPhase),
                )
              }
            >
              Run CAVEAT checkpoint
            </Button>
          </div>
        ) : null}

        {proposal.status === 'RECONFIRM_REQUIRED' && connected ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text)', marginBottom: '1rem' }}>
              Execution stays locked until the principal supplies fresh authorization. The
              contract will not release it, and neither will this page.
            </p>
            {isPrincipal ? (
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <Button
                  tone="lime"
                  disabled={isBusy(state.phase)}
                  onClick={() =>
                    void act('Reconfirm', () => caveat.reconfirm(address!, proposal.proposal_id, reportPhase))
                  }
                >
                  Reconfirm this action
                </Button>
                <Button
                  tone="crimson"
                  disabled={isBusy(state.phase)}
                  onClick={() =>
                    void act('Reject', () => caveat.reject(address!, proposal.proposal_id, reportPhase))
                  }
                >
                  Reject
                </Button>
              </div>
            ) : (
              <p style={{ fontSize: '0.72rem', color: 'var(--color-faint)' }}>
                Only the principal ({mandate.principal.slice(0, 10)}…) can reconfirm. The connected
                wallet cannot.
              </p>
            )}
          </div>
        ) : null}

        {proposal.executable && connected ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text)', marginBottom: '1rem' }}>
              The contract holds a single-use execution approval for this proposal. Consuming it
              returns the authorization artifact and is irreversible: a second attempt is
              rejected on chain.
            </p>
            {isAgent || isPrincipal ? (
              <Button
                tone="lime"
                disabled={isBusy(state.phase)}
                onClick={() =>
                  void act('Consume approval', async () => {
                    const result = await caveat.consumeApproval(address!, proposal.proposal_id, reportPhase);
                    if (typeof result.returned === 'string' && result.returned.startsWith('0x')) {
                      putAuthorization(proposal.proposal_id, result.returned);
                    }
                    return result;
                  })
                }
              >
                Consume Approval
              </Button>
            ) : (
              <p style={{ fontSize: '0.72rem', color: 'var(--color-faint)' }}>
                Only the mandated agent or the principal can consume this approval.
              </p>
            )}
          </div>
        ) : null}

        {proposal.approval_consumed ? (
          <SettlementSection
            proposal={proposal}
            mandate={mandate}
            connected={connected}
            address={address}
            allowed={isAgent || isPrincipal}
            walletChainIdHex={wallet.chainId ? `0x${wallet.chainId.toString(16)}` : null}
          />
        ) : null}

        {proposal.status === 'BLOCKED' ? (
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', textAlign: 'center' }}>
            No execution path exists for a blocked proposal. The agent must propose something
            else.
          </p>
        ) : null}
      </div>
    </div>
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
  mandate,
  connected,
  address,
  allowed,
  walletChainIdHex,
}: {
  proposal: Proposal;
  mandate: Mandate;
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
    const expectedSenders = [proposal.agent, mandate.principal].filter(Boolean);
    const result = await verifySettlement(chain, hash, proposal.proposal_id, expectedSenders, payee, amount);
    if (!result.paymentConfirmed) throw new Error(result.detail);
    const stored: Settlement = {
      proposalId: proposal.proposal_id,
      chain,
      txHash: hash,
      payee: result.payee,
      amountMinor: result.amountMinor,
      authorization,
      paymentConfirmed: result.paymentConfirmed,
      authorizedExecution: result.authorizedExecution,
      detail: result.detail,
      chainRef: result.chainRef,
      recordedAt: Math.floor(Date.now() / 1000),
    };
    putSettlement(stored);
    setRecord(stored);
    return stored;
  };

  const box: React.CSSProperties = {
    marginTop: '1.5rem',
    paddingTop: '1.5rem',
    borderTop: '1px solid rgba(234,243,255,.1)',
    textAlign: 'left',
  };

  if (record) {
    const recorded = SETTLEMENT_RAILS[record.chain as SettlementRail];
    return (
      <div style={box}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <span className="field-k" style={{ marginBottom: 0 }}>
            Settlement · outside the adjudication layer
          </span>
          {record.authorizedExecution ? (
            <span className="tag tag-lime">authorized execution, bound on {recorded?.label ?? record.chain}</span>
          ) : (
            <span className="tag tag-amber">unverified external payment</span>
          )}
        </div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text)' }}>
          {record.amountMinor} minor units to <span className="hash">{record.payee}</span> ·{' '}
          {record.detail}
        </p>
        {recorded ? (
          <a
            href={recorded.explorerTx(record.txHash)}
            target="_blank"
            rel="noreferrer"
            className="hash"
            style={{ display: 'inline-block', marginTop: '0.5rem', color: 'var(--color-crimson-hot)', wordBreak: 'break-all' }}
          >
            {record.txHash}
          </a>
        ) : null}
        {record.authorizedExecution ? (
          <p style={{ fontSize: '0.68rem', color: 'var(--color-faint)', marginTop: '0.5rem', lineHeight: 1.5 }}>
            This payment carries the exact authorization artifact CAVEAT issued for this decision,
            independently recomputed from contract state — not merely a plausible-looking transfer.
          </p>
        ) : (
          <p style={{ fontSize: '0.68rem', color: 'var(--color-amber)', marginTop: '0.5rem', lineHeight: 1.5 }}>
            This is a confirmed payment on {recorded?.label ?? record.chain}, but it is not
            cryptographically bound to this CAVEAT decision. CAVEAT itself does not enforce or
            prove this external execution — treat it as an unverified external payment, not as
            proof the decision was carried out.
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={box}>
      <div className="field-k" style={{ marginBottom: '0.5rem' }}>
        Settlement · outside the adjudication layer
      </div>
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', marginBottom: '0.875rem', lineHeight: 1.6 }}>
        The approval is consumed, so the action may now execute. GenLayer decided it; it does not
        settle it. Pay from your own wallet on a testnet: the payment carries the authorization
        artifact, and it is verified here against the settling chain.
      </p>

      {authorization ? (
        <div style={{ marginBottom: '0.875rem' }}>
          <div className="field-k" style={{ marginBottom: '0.3rem' }}>
            Authorization artifact
          </div>
          <p className="hash">{authorization}</p>
        </div>
      ) : (
        <p style={{ fontSize: '0.72rem', color: 'var(--color-amber)', marginBottom: '0.875rem', lineHeight: 1.5 }}>
          The authorization artifact from this browser is not available (it is returned when the
          approval is consumed). Payment can still be verified, but it will not carry the link to
          the decision.
        </p>
      )}

      <TxBanner state={state} onDismiss={reset} />

      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <label>
          <span className="field-k">Rail</span>
          <select
            value={rail}
            onChange={(event) => setRail(event.target.value as SettlementRail)}
            className="input"
          >
            {Object.entries(SETTLEMENT_RAILS).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-k">Amount ({config.symbol}, minor units)</span>
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ''))}
            placeholder={rail === 'sepolia' ? '10000000000000000' : '25000000'}
            className="input"
          />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          <span className="field-k">Payee</span>
          <input
            value={payee}
            onChange={(event) => setPayee(event.target.value.trim())}
            placeholder={rail === 'sepolia' ? '0x…' : 'base58 address'}
            className="input"
          />
        </label>
      </div>

      {config.walletPayable ? (
        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <Button
            tone="crimson"
            disabled={!connected || !allowed || isBusy(state.phase) || !payee || !amount}
            onClick={() =>
              void run('Pay and verify', async () => {
                const { txHash: sent } = await payOnSepolia(address!, payee, amount, authorization);
                setTxHash(sent);
                try {
                  return await verifyAndStore(sent, 'sepolia');
                } finally {
                  await returnToChain(walletChainIdHex ?? '0xf22d');
                }
              })
            }
          >
            Pay {config.symbol} from my wallet
          </Button>
          <a href={config.faucet} target="_blank" rel="noreferrer" className="hash" style={{ color: 'var(--color-crimson-hot)' }}>
            faucet
          </a>
        </div>
      ) : (
        <p style={{ marginTop: '1rem', fontSize: '0.72rem', color: 'var(--color-faint)', lineHeight: 1.6 }}>
          {config.label} is signed in a Solana wallet such as Phantom. Send the transfer there,
          then paste the signature below.{' '}
          <a href={config.faucet} target="_blank" rel="noreferrer" style={{ color: 'var(--color-crimson-hot)' }}>
            faucet
          </a>
        </p>
      )}

      <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(234,243,255,.08)' }}>
        <label>
          <span className="field-k">Already paid? Paste the transaction hash or signature to verify it</span>
          <input
            value={txHash}
            onChange={(event) => setTxHash(event.target.value.trim())}
            placeholder={rail === 'sepolia' ? '0x…' : 'signature'}
            className="input"
          />
        </label>
        <div style={{ marginTop: '0.875rem' }}>
          <Button
            tone="ghost"
            small
            disabled={isBusy(state.phase) || !txHash || !payee || !amount}
            onClick={() => void run('Verify payment', () => verifyAndStore(txHash, rail))}
          >
            Verify payment
          </Button>
        </div>
      </div>
    </div>
  );
};
