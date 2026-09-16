'use client';

import Link from 'next/link';
import { getMandates, getProposals } from '@/lib/genlayer/caveat';
import { useChainData } from '@/lib/genlayer/useChainData';
import type { Mandate, Proposal } from '@/lib/types';
import { Empty, Metric, RowLink, Tag } from '@/components/ui/primitives';
import { Reveal } from '@/components/ui/Reveal';

const VERDICT_TONE = { EXECUTE: 'lime', RECONFIRM: 'amber', BLOCK: 'crimson' } as const;

export default function Dashboard() {
  const { data, loading, error, refresh } = useChainData(async () => ({
    mandates: await getMandates(),
    proposals: await getProposals(),
  }));

  const mandates = data?.mandates.records ?? [];
  const proposals = data?.proposals.records ?? [];
  const mandatesTruncated = data ? data.mandates.total > mandates.length : false;
  const proposalsTruncated = data ? data.proposals.total > proposals.length : false;

  const active = mandates.filter((m) => m.status === 'ACTIVE');
  const pending = proposals.filter((p) => p.status === 'PROPOSED');
  const awaiting = proposals.filter((p) => p.status === 'RECONFIRM_REQUIRED');
  const decided = [...proposals].filter((p) => p.verdict).reverse();
  const authorized = proposals.filter((p) => p.executable);

  return (
    <>
      <section className="hero">
        <div className="halo" aria-hidden />
        <div className="eyebrow">
          <span className="eb-dash" />
          Autonomous Execution Checkpoint
        </div>
        <h1 className="headline">
          Permission can stay valid.
          <br />
          <span className="fade">Intent can change.</span>
        </h1>
        <p className="hero-sub">
          CAVEAT checks whether an agent&rsquo;s proposed action still faithfully represents the
          authority it was given: the final semantic checkpoint before consequential
          autonomous execution.
        </p>
        <div className="hero-cta">
          <Link href="/mandates/new" className="btn btn-crimson">
            Create Mandate
          </Link>
          <Link href="/demo" className="btn btn-ghost">
            Run The Three Scenarios
          </Link>
        </div>
      </section>

      <div className="section">
        {error ? (
          <div className="banner banner-error" style={{ marginBottom: '1.5rem' }}>
            {error}
          </div>
        ) : null}

        <Reveal
          style={{
            display: 'grid',
            gap: '1.25rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            marginBottom: '2rem',
          }}
        >
          <Metric
            label={mandatesTruncated ? `Active Mandates (recent ${mandates.length})` : 'Active Mandates'}
            value={loading ? '—' : active.length}
          />
          <Metric
            label={proposalsTruncated ? `Awaiting Checkpoint (recent ${proposals.length})` : 'Awaiting Checkpoint'}
            value={loading ? '—' : pending.length}
          />
          <Metric label="Reconfirmation Required" value={loading ? '—' : awaiting.length} tone="amber" />
          <Metric label="Execution Authorized" value={loading ? '—' : authorized.length} tone="lime" />
        </Reveal>
        {mandatesTruncated || proposalsTruncated ? (
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              color: 'var(--color-muted)',
              marginTop: '-1.25rem',
              marginBottom: '1.5rem',
            }}
          >
            Showing the most recent {mandates.length} of {data?.mandates.total} mandates and{' '}
            {proposals.length} of {data?.proposals.total} proposals — counts above reflect this
            recent window, not full history, to stay under Studio Next&rsquo;s shared rate limit.
          </p>
        ) : null}

        <div className="grid-2" style={{ marginBottom: awaiting.length > 0 ? '1.25rem' : 0 }}>
          <Reveal>
            <div className="panel">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div className="panel-head" style={{ marginBottom: 0 }}>
                  Mandates
                </div>
                <button
                  onClick={() => void refresh()}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)' }}
                >
                  refresh
                </button>
              </div>
              {loading ? (
                <Empty>Reading live Studio Next state — shared testnet reads may take around 30 seconds.</Empty>
              ) : mandates.length === 0 ? (
                <Empty>No mandates yet. Create one to begin.</Empty>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {[...mandates].reverse().map((mandate) => (
                    <MandateRow key={mandate.mandate_id} mandate={mandate} />
                  ))}
                </div>
              )}
            </div>
          </Reveal>

          <Reveal delay={0.06}>
            <div className="panel">
              <div className="panel-head">Recent Decisions</div>
              {loading ? (
                <Empty>Reading live Studio Next state — shared testnet reads may take around 30 seconds.</Empty>
              ) : decided.length === 0 ? (
                <Empty>No checkpoint has produced a verdict yet.</Empty>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {decided.slice(0, 8).map((proposal) => (
                    <DecisionRow key={proposal.proposal_id} proposal={proposal} />
                  ))}
                </div>
              )}
            </div>
          </Reveal>
        </div>

        {awaiting.length > 0 ? (
          <Reveal>
            <div className="panel" style={{ marginTop: '1.25rem' }}>
              <div className="panel-head">Reconfirmation Requests</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {awaiting.map((proposal) => (
                  <RowLink key={proposal.proposal_id} href={`/proposals/${proposal.proposal_id}`}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <div>
                        <div className="mono-id">{proposal.proposal_id}</div>
                        <p style={{ marginTop: '0.3rem', fontSize: '0.8125rem', color: 'var(--color-text)' }}>
                          {proposal.action_summary}
                        </p>
                        <p style={{ marginTop: '0.2rem', fontSize: '0.72rem', color: 'var(--color-amber)' }}>
                          {proposal.material_changed_fact || proposal.reason_code}
                        </p>
                      </div>
                      <Tag tone="amber">execution locked</Tag>
                    </div>
                  </RowLink>
                ))}
              </div>
            </div>
          </Reveal>
        ) : null}
      </div>
    </>
  );
}

const MandateRow = ({ mandate }: { mandate: Mandate }) => (
  <RowLink href={`/mandates/${mandate.mandate_id}`}>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
      <div style={{ minWidth: 0 }}>
        <div className="mono-id">{mandate.mandate_id}</div>
        <p
          style={{
            marginTop: '0.3rem',
            maxWidth: 420,
            fontSize: '0.8125rem',
            color: 'var(--color-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {mandate.intent_text}
        </p>
      </div>
      <Tag tone={mandate.status === 'ACTIVE' ? 'lime' : 'neutral'}>{mandate.status}</Tag>
    </div>
  </RowLink>
);

const DecisionRow = ({ proposal }: { proposal: Proposal }) => (
  <RowLink href={`/receipts/${proposal.proposal_id}`}>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
      <div style={{ minWidth: 0 }}>
        <div className="mono-id">{proposal.proposal_id}</div>
        <p
          style={{
            marginTop: '0.3rem',
            maxWidth: 320,
            fontSize: '0.8125rem',
            color: 'var(--color-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {proposal.action_summary}
        </p>
        <p className="hash" style={{ marginTop: '0.2rem' }}>
          {proposal.reason_code}
        </p>
      </div>
      <Tag tone={VERDICT_TONE[proposal.verdict as keyof typeof VERDICT_TONE]}>{proposal.verdict}</Tag>
    </div>
  </RowLink>
);
