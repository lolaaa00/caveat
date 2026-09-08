'use client';

import Link from 'next/link';
import { getMandates, getProposals } from '@/lib/genlayer/caveat';
import { useChainData } from '@/lib/genlayer/useChainData';
import type { Mandate, Proposal } from '@/lib/types';
import { Badge, CardLink, Empty, Mono, Panel } from '@/components/ui/primitives';

const VERDICT_TONE = { EXECUTE: 'execute', RECONFIRM: 'reconfirm', BLOCK: 'block' } as const;

export default function Dashboard() {
  const { data, loading, error, refresh } = useChainData(async () => ({
    mandates: await getMandates(),
    proposals: await getProposals(),
  }));

  const mandates = data?.mandates ?? [];
  const proposals = data?.proposals ?? [];

  const active = mandates.filter((m) => m.status === 'ACTIVE');
  const pending = proposals.filter((p) => p.status === 'PROPOSED');
  const awaiting = proposals.filter((p) => p.status === 'RECONFIRM_REQUIRED');
  const decided = [...proposals].filter((p) => p.verdict).reverse();
  const authorized = proposals.filter((p) => p.executable);

  return (
    <div className="space-y-6">
      <section className="border border-line bg-panel">
        <div className="relative overflow-hidden px-6 py-8">
          <div className="grid-faint absolute inset-0" aria-hidden />
          <div className="relative">
            <div className="label mb-3">Context-aware validation before autonomous execution</div>
            <h1 className="max-w-3xl text-[26px] leading-tight text-ink">
              Authorization proves an agent <em className="text-ink-dim not-italic">may</em> act.
              CAVEAT verifies whether acting still means what you meant.
            </h1>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/mandates/new">
                <span className="datum border border-signal bg-signal/15 px-3.5 py-2 text-[11px] tracking-[0.1em] text-signal uppercase">
                  Create mandate
                </span>
              </Link>
              <Link href="/demo">
                <span className="datum border border-line-strong bg-raised px-3.5 py-2 text-[11px] tracking-[0.1em] text-ink uppercase">
                  Run the three scenarios
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="border border-block/60 bg-block-dim px-4 py-3 text-[13px] text-block">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Active mandates" value={active.length} />
        <Metric label="Awaiting checkpoint" value={pending.length} />
        <Metric label="Reconfirmation required" value={awaiting.length} tone="reconfirm" />
        <Metric label="Execution authorized" value={authorized.length} tone="execute" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Mandates"
          aside={
            <button onClick={() => void refresh()} className="label hover:text-ink-dim">
              refresh
            </button>
          }
        >
          {loading ? (
            <Empty>Reading from the contract…</Empty>
          ) : mandates.length === 0 ? (
            <Empty>No mandates yet. Create one to begin.</Empty>
          ) : (
            <div className="space-y-2">
              {[...mandates].reverse().map((mandate) => (
                <MandateRow key={mandate.mandate_id} mandate={mandate} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Recent decisions">
          {loading ? (
            <Empty>Reading from the contract…</Empty>
          ) : decided.length === 0 ? (
            <Empty>No checkpoint has produced a verdict yet.</Empty>
          ) : (
            <div className="space-y-2">
              {decided.slice(0, 8).map((proposal) => (
                <DecisionRow key={proposal.proposal_id} proposal={proposal} />
              ))}
            </div>
          )}
        </Panel>
      </div>

      {awaiting.length > 0 ? (
        <Panel title="Reconfirmation requests">
          <div className="space-y-2">
            {awaiting.map((proposal) => (
              <CardLink key={proposal.proposal_id} href={`/proposals/${proposal.proposal_id}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Mono>{proposal.proposal_id}</Mono>
                    <p className="mt-1 text-[13px] text-ink">{proposal.action_summary}</p>
                    <p className="mt-1 text-[12px] text-reconfirm">
                      {proposal.material_changed_fact || proposal.reason_code}
                    </p>
                  </div>
                  <Badge tone="reconfirm">execution locked</Badge>
                </div>
              </CardLink>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

const Metric = ({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'execute' | 'reconfirm';
}) => {
  const color =
    tone === 'execute' ? 'text-execute' : tone === 'reconfirm' ? 'text-reconfirm' : 'text-ink';
  return (
    <div className="border border-line bg-panel px-4 py-3.5">
      <div className="label">{label}</div>
      <div className={`datum mt-2 text-[30px] leading-none ${color}`}>{value}</div>
    </div>
  );
};

const MandateRow = ({ mandate }: { mandate: Mandate }) => (
  <CardLink href={`/mandates/${mandate.mandate_id}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <Mono>{mandate.mandate_id}</Mono>
        <p className="mt-1 line-clamp-2 max-w-lg text-[13px] text-ink">{mandate.intent_text}</p>
      </div>
      <Badge tone={mandate.status === 'ACTIVE' ? 'execute' : 'neutral'}>{mandate.status}</Badge>
    </div>
  </CardLink>
);

const DecisionRow = ({ proposal }: { proposal: Proposal }) => (
  <CardLink href={`/receipts/${proposal.proposal_id}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <Mono>{proposal.proposal_id}</Mono>
        <p className="mt-1 truncate max-w-md text-[13px] text-ink">{proposal.action_summary}</p>
        <p className="datum mt-1 text-[11px] text-ink-faint">{proposal.reason_code}</p>
      </div>
      <Badge tone={VERDICT_TONE[proposal.verdict as keyof typeof VERDICT_TONE]}>
        {proposal.verdict}
      </Badge>
    </div>
  </CardLink>
);
