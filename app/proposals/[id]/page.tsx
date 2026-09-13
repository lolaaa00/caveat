'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as caveat from '@/lib/genlayer/caveat';
import { useChainData } from '@/lib/genlayer/useChainData';
import { useWallet } from '@/lib/wallet/useWallet';
import { Empty } from '@/components/ui/primitives';
import { Reveal } from '@/components/ui/Reveal';
import { ComparisonGrid } from '@/components/proposal/ComparisonGrid';
import { CheckTable } from '@/components/proposal/CheckTable';
import { ContextPanel } from '@/components/proposal/ContextPanel';
import { Timeline } from '@/components/proposal/Timeline';
import { IntentFidelity } from '@/components/decision/IntentFidelity';
import { Divider } from '@/components/decision/Divider';
import { VerdictBanner } from '@/components/decision/VerdictBanner';
import { ExecutionGate } from '@/components/execution/ExecutionGate';
import { skinFor, skinVars } from '@/lib/ui/verdict';

/**
 * The checkpoint. Mandate, proposed action and current context side by side, then the
 * deterministic checks, the current-context beat, the fidelity chain, the verdict, and
 * the gate — in that order, because that is the order the contract actually decides in.
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
    return (
      <div className="section">
        <div className="panel" style={{ borderColor: 'rgba(255,21,88,.4)' }}>
          <p style={{ color: 'var(--color-crimson-hot)', fontSize: '0.8125rem' }}>{error}</p>
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="section">
        <Empty>Reading the checkpoint from the contract…</Empty>
      </div>
    );
  }
  if (!data?.proposal || !data.mandate) {
    return (
      <div className="section">
        <Empty>Proposal not found.</Empty>
      </div>
    );
  }

  const { proposal, mandate } = data;

  return (
    <div className="section" style={{ paddingTop: '2.5rem', ...skinVars(skinFor(proposal.verdict)) }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '2rem' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: '0.75rem' }}>
            <span className="eb-dash" />
            Live Execution Checkpoint
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.875rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', letterSpacing: '0.04em', margin: 0 }}>
              {proposal.proposal_id}
            </h1>
            <Link href={`/mandates/${mandate.mandate_id}`} className="mono-id" style={{ color: 'var(--color-crimson-hot)' }}>
              {mandate.mandate_id}
            </Link>
          </div>
          <p style={{ marginTop: '0.4rem', fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
            {proposal.action_summary}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className="tag tag-neutral">{proposal.status}</span>
          {proposal.approval_consumed ? <span className="tag tag-neutral">approval consumed</span> : null}
          {proposal.decided_at ? (
            <Link href={`/receipts/${proposal.proposal_id}`}>
              <span className="tag tag-amber">decision receipt</span>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="sec-lbl">Live Checkpoint</div>
      <Reveal>
        <ComparisonGrid mandate={mandate} proposal={proposal} />
      </Reveal>

      <Reveal delay={0.06}>
        <div className="panel-flat" style={{ margin: '1.25rem 0' }}>
          <div className="checks-title">Deterministic Checks · run before any model</div>
          <CheckTable checks={proposal.deterministic_checks} />
        </div>
      </Reveal>

      <Divider proposal={proposal} />

      <div className="sec-lbl" style={{ marginTop: '1rem' }}>
        Evidence &middot; Context
      </div>
      <Reveal className="grid-evidence" style={{ marginBottom: '1.25rem' }}>
        <ContextPanel evidence={proposal.evidence} materialChangedFact={proposal.material_changed_fact} />
        <div className="panel">
          <div className="panel-head">Evaluation Timeline</div>
          <Timeline proposal={proposal} />
        </div>
      </Reveal>

      <Reveal delay={0.06}>
        <IntentFidelity proposal={proposal} />
      </Reveal>

      <div className="sec-lbl" style={{ marginTop: '2rem' }}>
        Verdict
      </div>
      <Reveal>
        <VerdictBanner proposal={proposal} />
      </Reveal>

      <div style={{ height: '1.5rem' }} />

      <Reveal>
        <ExecutionGate proposal={proposal} mandate={mandate} wallet={wallet} onChanged={refresh} />
      </Reveal>

      <div style={{ height: '1.5rem' }} />

      <Reveal>
        <div className="sot-bar">
          <div className="sot-l">
            <span className="sot-dot" />
            <span className="sot-txt">
              Authoritative state: <strong>GenLayer Intelligent Contract</strong>. The
              frontend renders contract state; it never computes the verdict.
            </span>
          </div>
          <div className="sot-tags">
            <span className="sot-tag">Deterministic</span>
            <span className="sot-tag">Semantic</span>
            <span className="sot-tag">Consensus</span>
            <span className="sot-tag">Execution</span>
          </div>
        </div>
      </Reveal>

      <Reveal>
        <div style={{ marginTop: '1.25rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <div className="field-k" style={{ marginBottom: '0.3rem' }}>
              Mandate commitment at decision
            </div>
            <p className="hash">{proposal.mandate_commitment}</p>
          </div>
          <div>
            <div className="field-k" style={{ marginBottom: '0.3rem' }}>
              Evidence digest
            </div>
            <p className="hash">{proposal.evidence_digest || '-'}</p>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
