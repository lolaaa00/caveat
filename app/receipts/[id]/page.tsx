'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { SETTLEMENT_RAILS, type SettlementRail } from '@/lib/config';
import * as caveat from '@/lib/genlayer/caveat';
import { useChainData } from '@/lib/genlayer/useChainData';
import { Badge, Empty, Mono } from '@/components/ui/primitives';

const when = (seconds: number) =>
  seconds ? new Date(seconds * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—';

const TONE = { EXECUTE: 'execute', RECONFIRM: 'reconfirm', BLOCK: 'block' } as const;
const GATE = {
  EXECUTE: 'AUTHORIZED',
  RECONFIRM: 'LOCKED',
  BLOCK: 'REFUSED',
} as const;

const Line = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line py-2">
    <span className="label">{label}</span>
    <span className="datum max-w-[62%] text-right text-[12px] break-words text-ink">{value}</span>
  </div>
);

/** An immutable decision receipt, read back from the contract. */
export default function Receipt() {
  const params = useParams<{ id: string }>();
  const { data, loading, error } = useChainData(async () => {
    const proposal = await caveat.getProposal(params.id);
    const mandate = proposal ? await caveat.getMandate(proposal.mandate_id) : null;
    return { proposal, mandate };
  }, [params.id]);

  if (error) {
    return <div className="border border-block/60 bg-block-dim px-4 py-3 text-[13px] text-block">{error}</div>;
  }
  if (loading) return <Empty>Reading the receipt from the contract…</Empty>;
  if (!data?.proposal || !data.mandate) return <Empty>Receipt not found.</Empty>;

  const { proposal, mandate } = data;
  const verdict = (proposal.verdict || 'RECONFIRM') as keyof typeof TONE;
  const rail = proposal.settlement
    ? SETTLEMENT_RAILS[proposal.settlement.chain as SettlementRail]
    : null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="border border-line bg-panel">
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="datum text-[12px] tracking-[0.22em] text-ink">CAVEAT DECISION RECEIPT</div>
          <Badge tone={TONE[verdict]}>{proposal.verdict || 'PENDING'}</Badge>
        </header>

        <div className="px-5 py-4">
          <Line label="Proposal" value={proposal.proposal_id} />
          <Line
            label="Mandate"
            value={
              <Link href={`/mandates/${mandate.mandate_id}`} className="text-signal hover:underline">
                {mandate.mandate_id}
              </Link>
            }
          />
          <Line label="Action" value={proposal.action_summary} />
          {Object.entries(proposal.action_payload).map(([key, value]) => (
            <Line
              key={key}
              label={key.replace(/_/g, ' ')}
              value={typeof value === 'object' ? JSON.stringify(value) : String(value)}
            />
          ))}

          <div className="mt-5">
            <div className="label mb-2">Deterministic checks</div>
            {proposal.deterministic_checks.map((check) => (
              <div key={check.label + check.field} className="flex items-baseline gap-2 py-1">
                <span className={`datum text-[12px] ${check.passed ? 'text-execute' : 'text-block'}`}>
                  {check.passed ? '✓' : '✗'}
                </span>
                <span className="datum text-[12px] text-ink">{check.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <div className="label mb-2">Current evidence</div>
            {proposal.evidence.length === 0 ? (
              <p className="text-[12px] text-ink-faint">
                None retrieved — deterministic checks decided this proposal.
              </p>
            ) : (
              proposal.evidence.map((item) => (
                <div key={item.qid} className="py-1">
                  <span className="datum text-[12px] text-ink">{item.claim}</span>
                  <span className="label ml-2">{item.retrieval_class}</span>
                  <div className="text-[11px] text-ink-faint">{item.question}</div>
                </div>
              ))
            )}
          </div>

          <div className="rule mt-5 pt-4">
            <Line label="GenLayer consensus" value={proposal.verdict || 'PENDING'} />
            <Line label="Reason" value={proposal.reason_code || '—'} />
            {proposal.material_changed_fact ? (
              <Line label="Material changed fact" value={proposal.material_changed_fact} />
            ) : null}
            {proposal.short_rationale ? (
              <Line label="Rationale" value={proposal.short_rationale} />
            ) : null}
            <Line label="Confidence" value={proposal.confidence || '—'} />
            <Line label="Decided" value={when(proposal.decided_at)} />
            {proposal.reconfirmed_at ? (
              <Line label="Reconfirmed by principal" value={when(proposal.reconfirmed_at)} />
            ) : null}
            <Line label="Evidence digest" value={proposal.evidence_digest || '—'} />
            <Line label="Mandate commitment" value={proposal.mandate_commitment} />
          </div>

          <div className="rule mt-5 pt-4">
            <div className="flex items-baseline justify-between">
              <span className="label">Execution</span>
              <span
                className={`datum text-[20px] tracking-[0.1em] ${
                  verdict === 'EXECUTE' ? 'text-execute' : verdict === 'BLOCK' ? 'text-block' : 'text-reconfirm'
                }`}
              >
                {proposal.approval_consumed ? 'CONSUMED' : GATE[verdict]}
              </span>
            </div>
            {proposal.approval_consumed ? (
              <p className="mt-1 text-[12px] text-ink-faint">
                One-time approval consumed at {when(proposal.consumed_at)}. A replay is rejected by
                the contract.
              </p>
            ) : null}
          </div>

          {proposal.settlement ? (
            <div className="rule mt-5 pt-4">
              <div className="label mb-2">Settlement</div>
              <Line label="Rail" value={rail?.label ?? proposal.settlement.chain} />
              <Line label="Payee" value={proposal.settlement.payee} />
              <Line label="Amount (minor units)" value={proposal.settlement.amount_minor} />
              <Line label="Verification" value={proposal.settlement.detail} />
              <Line
                label="Transaction"
                value={
                  rail ? (
                    <a
                      href={rail.explorerTx(proposal.settlement.tx_hash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-signal hover:underline"
                    >
                      {proposal.settlement.tx_hash}
                    </a>
                  ) : (
                    proposal.settlement.tx_hash
                  )
                }
              />
            </div>
          ) : null}
        </div>
      </div>

      <p className="mt-4 text-center">
        <Mono>Read from the Intelligent Contract. Not computed by this page.</Mono>
      </p>
    </div>
  );
}
