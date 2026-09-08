'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as caveat from '@/lib/genlayer/caveat';
import { useChainData } from '@/lib/genlayer/useChainData';
import { useWallet } from '@/lib/wallet/useWallet';
import { Badge, Empty, Mono, Panel } from '@/components/ui/primitives';
import { ComparisonGrid } from '@/components/proposal/ComparisonGrid';
import { CheckTable } from '@/components/proposal/CheckTable';
import { EvidencePanel } from '@/components/proposal/EvidencePanel';
import { VerdictBanner } from '@/components/decision/VerdictBanner';
import { ExecutionGate } from '@/components/execution/ExecutionGate';

/**
 * The checkpoint. Mandate, proposed action and current context side by side, then the
 * deterministic checks, then the consensus verdict, then the gate.
 */
export default function ProposalCheckpoint() {
  const params = useParams<{ id: string }>();
  const wallet = useWallet();

  const { data, loading, error, refresh } = useChainData(async () => {
    const proposal = await caveat.getProposal(params.id);
    const mandate = proposal ? await caveat.getMandate(proposal.mandate_id) : null;
    return { proposal, mandate };
  }, [params.id]);

  if (error) {
    return <div className="border border-block/60 bg-block-dim px-4 py-3 text-[13px] text-block">{error}</div>;
  }
  if (loading) return <Empty>Reading the checkpoint from the contract…</Empty>;
  if (!data?.proposal || !data.mandate) return <Empty>Proposal not found.</Empty>;

  const { proposal, mandate } = data;
  const evaluated = Boolean(proposal.decided_at);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="label mb-1">Live execution checkpoint</div>
          <div className="flex items-baseline gap-3">
            <h1 className="datum text-[22px] tracking-[0.08em] text-ink">{proposal.proposal_id}</h1>
            <Link href={`/mandates/${mandate.mandate_id}`} className="datum text-[12px] text-signal hover:underline">
              {mandate.mandate_id}
            </Link>
          </div>
          <p className="mt-1 text-[13px] text-ink-dim">{proposal.action_summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{proposal.status}</Badge>
          {proposal.approval_consumed ? <Badge tone="neutral">approval consumed</Badge> : null}
          {evaluated ? (
            <Link href={`/receipts/${proposal.proposal_id}`}>
              <Badge tone="signal">decision receipt</Badge>
            </Link>
          ) : null}
        </div>
      </div>

      <ComparisonGrid mandate={mandate} proposal={proposal} evidence={proposal.evidence} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Deterministic pre-checks"
          aside={<span className="label">run before any model</span>}
        >
          <CheckTable checks={proposal.deterministic_checks} />
          {proposal.deterministic_checks.length > 0 &&
          proposal.deterministic_checks.every((check) => check.passed) ? (
            <p className="mt-3 text-[12px] text-ink-faint">
              All fixed rules pass. A conventional permission system would execute here.
            </p>
          ) : null}
        </Panel>

        <Panel
          title="Current evidence"
          aside={<span className="label">retrieved by validators</span>}
        >
          <EvidencePanel evidence={proposal.evidence} digest={proposal.evidence_digest} />
        </Panel>
      </div>

      <VerdictBanner proposal={proposal} />

      <ExecutionGate proposal={proposal} mandate={mandate} wallet={wallet} onChanged={refresh} />

      <Panel title="Binding">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="label mb-1">Mandate commitment at decision</div>
            <Mono className="break-all">{proposal.mandate_commitment}</Mono>
          </div>
          <div>
            <div className="label mb-1">Evidence digest</div>
            <Mono className="break-all">{proposal.evidence_digest || '—'}</Mono>
          </div>
        </div>
      </Panel>
    </div>
  );
}
