'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SETTLEMENT_RAILS, type SettlementRail } from '@/lib/config';
import * as caveat from '@/lib/genlayer/caveat';
import { useChainData } from '@/lib/genlayer/useChainData';
import { getSettlement } from '@/lib/settlement/store';
import type { Settlement } from '@/lib/types';
import { skinFor } from '@/lib/ui/verdict';
import { Empty } from '@/components/ui/primitives';

const when = (seconds: number) =>
  seconds ? new Date(seconds * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—';

const GATE = { EXECUTE: 'AUTHORIZED', RECONFIRM: 'LOCKED', BLOCK: 'REFUSED' } as const;

const Line = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="kv-item">
    <span className="kv-k">{label}</span>
    <span className="kv-v" style={{ maxWidth: '62%' }}>
      {value}
    </span>
  </div>
);

/** An immutable decision receipt, read back from the contract. */
export default function Receipt() {
  const params = useParams<{ id: string }>();
  const [settlement, setSettlement] = useState<Settlement | null>(null);

  useEffect(() => {
    setSettlement(getSettlement(params.id));
  }, [params.id]);

  const { data, loading, error } = useChainData(async () => {
    const proposal = await caveat.getProposal(params.id);
    const mandate = proposal ? await caveat.getMandate(proposal.mandate_id) : null;
    return { proposal, mandate };
  }, [params.id]);

  if (error) {
    return (
      <div className="section">
        <div className="banner banner-error">{error}</div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="section">
        <Empty>Reading the receipt from the contract…</Empty>
      </div>
    );
  }
  if (!data?.proposal || !data.mandate) {
    return (
      <div className="section">
        <Empty>Receipt not found.</Empty>
      </div>
    );
  }

  const { proposal, mandate } = data;
  const verdict = (proposal.verdict || 'RECONFIRM') as keyof typeof GATE;
  const skin = skinFor(proposal.verdict);
  const rail = settlement ? SETTLEMENT_RAILS[settlement.chain as SettlementRail] : null;

  return (
    <div className="section" style={{ paddingTop: '2.5rem', maxWidth: 620, margin: '0 auto' }}>
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.375rem',
            borderBottom: '1px solid rgba(234,243,255,.09)',
          }}
        >
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', letterSpacing: '0.2em' }}>
            CAVEAT DECISION RECEIPT
          </div>
          <span className="tag tag-verdict" style={{ '--chip-color': skin.color, '--chip-bg': skin.bg } as React.CSSProperties}>
            {proposal.verdict || 'PENDING'}
          </span>
        </header>

        <div style={{ padding: '1.375rem' }}>
          <Line label="Proposal" value={proposal.proposal_id} />
          <Line
            label="Mandate"
            value={
              <Link href={`/mandates/${mandate.mandate_id}`} style={{ color: 'var(--color-crimson-hot)' }}>
                {mandate.mandate_id}
              </Link>
            }
          />
          <Line label="Action" value={proposal.action_summary} />
          {Object.entries(proposal.action_payload).map(([key, value]) => (
            <Line key={key} label={key.replace(/_/g, ' ')} value={typeof value === 'object' ? JSON.stringify(value) : String(value)} />
          ))}

          <div style={{ marginTop: '1.5rem' }}>
            <div className="field-k" style={{ marginBottom: '0.6rem' }}>
              Deterministic checks
            </div>
            {proposal.deterministic_checks.map((check) => (
              <div key={check.label + check.field} style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', padding: '0.2rem 0' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: check.passed ? 'var(--color-lime)' : 'var(--color-crimson-hot)' }}>
                  {check.passed ? '✓' : '✕'}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{check.label}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <div className="field-k" style={{ marginBottom: '0.6rem' }}>
              Current evidence
            </div>
            {proposal.evidence.length === 0 ? (
              <p style={{ fontSize: '0.75rem', color: 'var(--color-faint)' }}>
                None retrieved — deterministic checks decided this proposal.
              </p>
            ) : (
              proposal.evidence.map((item) => (
                <div key={item.qid} style={{ padding: '0.2rem 0' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{item.claim}</span>
                  <span className="field-k" style={{ marginLeft: '0.5rem', display: 'inline' }}>
                    {item.retrieval_class}
                  </span>
                  <div style={{ fontSize: '0.68rem', color: 'var(--color-faint)' }}>{item.question}</div>
                </div>
              ))
            )}
          </div>

          <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(234,243,255,.09)' }}>
            <Line label="GenLayer consensus" value={proposal.verdict || 'PENDING'} />
            <Line label="Reason" value={proposal.reason_code || '—'} />
            {proposal.material_changed_fact ? <Line label="Material changed fact" value={proposal.material_changed_fact} /> : null}
            {proposal.short_rationale ? <Line label="Rationale" value={proposal.short_rationale} /> : null}
            <Line label="Confidence" value={proposal.confidence || '—'} />
            <Line label="Decided" value={when(proposal.decided_at)} />
            {proposal.reconfirmed_at ? <Line label="Reconfirmed by principal" value={when(proposal.reconfirmed_at)} /> : null}
            <Line label="Evidence digest" value={proposal.evidence_digest || '—'} />
            <Line label="Mandate commitment" value={proposal.mandate_commitment} />
          </div>

          <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(234,243,255,.09)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span className="field-k">Execution</span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1.25rem',
                  letterSpacing: '0.08em',
                  color: verdict === 'EXECUTE' ? 'var(--color-lime)' : verdict === 'BLOCK' ? 'var(--color-crimson-hot)' : 'var(--color-amber)',
                }}
              >
                {proposal.approval_consumed ? 'CONSUMED' : GATE[verdict]}
              </span>
            </div>
            {proposal.approval_consumed ? (
              <p style={{ marginTop: '0.3rem', fontSize: '0.75rem', color: 'var(--color-faint)' }}>
                One-time approval consumed at {when(proposal.consumed_at)}. A replay is rejected by
                the contract.
              </p>
            ) : null}
          </div>

          {settlement ? (
            <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(234,243,255,.09)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span className="field-k">Settlement</span>
                <span className="field-k">outside the adjudication layer</span>
              </div>
              <Line label="Rail" value={rail?.label ?? settlement.chain} />
              <Line label="Payee" value={settlement.payee} />
              <Line label="Amount (minor units)" value={settlement.amountMinor} />
              <Line label="Verification" value={settlement.detail} />
              {settlement.authorization ? <Line label="Authorized by" value={settlement.authorization} /> : null}
              <Line
                label="Transaction"
                value={
                  rail ? (
                    <a href={rail.explorerTx(settlement.txHash)} target="_blank" rel="noreferrer" style={{ color: 'var(--color-crimson-hot)' }}>
                      {settlement.txHash}
                    </a>
                  ) : (
                    settlement.txHash
                  )
                }
              />
              <p style={{ marginTop: '0.5rem', fontSize: '0.68rem', color: 'var(--color-faint)', lineHeight: 1.5 }}>
                Verified directly against {rail?.label ?? settlement.chain}. The contract holds no
                payment state: it decided, and this executed behind the gate.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <p style={{ marginTop: '1rem', textAlign: 'center' }}>
        <span className="hash">The decision is read from the Intelligent Contract. Not computed by this page.</span>
      </p>
    </div>
  );
}
