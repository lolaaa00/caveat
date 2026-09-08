'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { explorerAddress } from '@/lib/config';
import * as caveat from '@/lib/genlayer/caveat';
import { useChainData } from '@/lib/genlayer/useChainData';
import { flight, summarise } from '@/lib/fixtures/scenarios';
import { useTx } from '@/lib/wallet/useTx';
import { useWallet } from '@/lib/wallet/useWallet';
import { Badge, Button, Empty, Field, Mono, Panel } from '@/components/ui/primitives';
import { TxBanner } from '@/components/ui/TxBanner';

const VERDICT_TONE = { EXECUTE: 'execute', RECONFIRM: 'reconfirm', BLOCK: 'block' } as const;
const when = (seconds: number) =>
  seconds ? new Date(seconds * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—';

export default function MandateDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const wallet = useWallet();
  const { state, run, reset } = useTx();
  const [payloadText, setPayloadText] = useState(
    JSON.stringify(flight({ arrival_local_time: '10:30' }), null, 2),
  );

  const { data, loading, error, refresh } = useChainData(async () => {
    const mandate = await caveat.getMandate(params.id);
    const proposalIds = await caveat.proposalIdsForMandate(params.id);
    const proposals = await Promise.all(proposalIds.map((id) => caveat.getProposal(id)));
    return { mandate, proposals: proposals.filter((p) => p !== null) };
  }, [params.id]);

  const mandate = data?.mandate ?? null;
  const proposals = data?.proposals ?? [];
  const address = wallet.address;
  const isPrincipal = Boolean(address && mandate && address.toLowerCase() === mandate.principal.toLowerCase());
  const isAgent = Boolean(address && mandate && address.toLowerCase() === mandate.agent.toLowerCase());

  if (error) {
    return <div className="border border-block/60 bg-block-dim px-4 py-3 text-[13px] text-block">{error}</div>;
  }
  if (loading || !mandate) {
    return <Empty>{loading ? 'Reading mandate from the contract…' : 'Mandate not found.'}</Empty>;
  }

  const submitProposal = async () => {
    if (!address) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payloadText);
    } catch {
      return;
    }
    const result = await run('Submit proposal', async () => {
      const created = await caveat.submitProposal(
        address,
        mandate.mandate_id,
        JSON.stringify(parsed),
        summarise(parsed as never),
      );
      const ids = await caveat.proposalIdsForMandate(mandate.mandate_id);
      return { ...created, proposalId:
        typeof created.returned === 'string' ? created.returned : ids[ids.length - 1] };
    });
    if (result?.proposalId) router.push(`/proposals/${result.proposalId}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Mono>{mandate.mandate_id}</Mono>
          <h1 className="mt-1 max-w-2xl text-[20px] leading-snug text-ink">{mandate.intent_text}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={mandate.status === 'ACTIVE' ? 'execute' : 'neutral'}>{mandate.status}</Badge>
          {mandate.reconfirm_count > 0 ? (
            <Badge tone="reconfirm">reconfirmed ×{mandate.reconfirm_count}</Badge>
          ) : null}
        </div>
      </div>

      <TxBanner state={state} onDismiss={reset} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Mandate">
          <div className="space-y-4">
            <Field label="Purpose">{mandate.purpose_text || '—'}</Field>
            <Field label="Semantic conditions">{mandate.semantic_conditions || '—'}</Field>
            <Field label="Reconfirmation policy">{mandate.reconfirm_policy || '—'}</Field>
            <Field label="Hard constraints">
              <ul className="space-y-1">
                {mandate.hard_constraints.map((constraint) => (
                  <li key={constraint.label} className="datum text-[12px] text-ink-dim">
                    {constraint.label}: {constraint.field} {constraint.op}{' '}
                    {constraint.value === undefined ? '' : JSON.stringify(constraint.value)}
                  </li>
                ))}
              </ul>
            </Field>
            <Field label="Approved evidence sources">
              <ul className="space-y-1">
                {mandate.approved_sources.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="datum text-[11px] break-all text-signal hover:underline"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </Field>
            <Field label="Evidence questions">
              <ul className="space-y-1">
                {mandate.evidence_questions.map((question) => (
                  <li key={question.qid} className="text-[12px] text-ink-dim">
                    {question.question}
                    {question.fallback_claim ? (
                      <span className="text-reconfirm"> · fallback “{question.fallback_claim}”</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Field>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Parties and window">
            <div className="space-y-4">
              <Field label="Principal">
                <a
                  href={explorerAddress(mandate.principal)}
                  target="_blank"
                  rel="noreferrer"
                  className="datum text-[12px] break-all text-signal hover:underline"
                >
                  {mandate.principal}
                </a>
              </Field>
              <Field label="Authorized agent">
                <span className="datum text-[12px] break-all text-ink-dim">{mandate.agent}</span>
              </Field>
              <Field label="Created">{when(mandate.created_at)}</Field>
              <Field label="Expires">{when(mandate.expires_at)}</Field>
              <Field label="Policy commitment">
                <span className="datum text-[11px] break-all text-ink-faint">
                  {mandate.commitment || 'not frozen until activation'}
                </span>
              </Field>
            </div>
          </Panel>

          {isPrincipal ? (
            <Panel title="Principal controls">
              <div className="flex flex-wrap gap-3">
                {mandate.status === 'DRAFT' ? (
                  <Button
                    tone="execute"
                    disabled={state.phase === 'pending'}
                    onClick={() =>
                      void run('Activate mandate', async () => {
                        const result = await caveat.activateMandate(address!, mandate.mandate_id);
                        refresh();
                        return result;
                      })
                    }
                  >
                    Activate
                  </Button>
                ) : null}
                {mandate.status === 'ACTIVE' ? (
                  <Button
                    tone="block"
                    disabled={state.phase === 'pending'}
                    onClick={() =>
                      void run('Revoke mandate', async () => {
                        const result = await caveat.revokeMandate(address!, mandate.mandate_id);
                        refresh();
                        return result;
                      })
                    }
                  >
                    Revoke
                  </Button>
                ) : null}
              </div>
            </Panel>
          ) : null}
        </div>
      </div>

      {mandate.status === 'ACTIVE' && isAgent ? (
        <Panel title="Submit a proposal as the mandated agent">
          <textarea
            value={payloadText}
            onChange={(event) => setPayloadText(event.target.value)}
            rows={12}
            className="datum w-full border border-line bg-surface px-2.5 py-2 text-[12px] text-ink"
          />
          <div className="mt-3">
            <Button tone="primary" disabled={state.phase === 'pending'} onClick={() => void submitProposal()}>
              Submit proposal
            </Button>
          </div>
        </Panel>
      ) : null}

      <Panel title="Proposals against this mandate">
        {proposals.length === 0 ? (
          <Empty>No proposals yet.</Empty>
        ) : (
          <div className="space-y-2">
            {proposals.map((proposal) => (
              <Link
                key={proposal.proposal_id}
                href={`/proposals/${proposal.proposal_id}`}
                className="block border border-line bg-surface p-3 transition-colors hover:border-line-strong"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Mono>{proposal.proposal_id}</Mono>
                    <p className="mt-1 text-[13px] text-ink">{proposal.action_summary}</p>
                  </div>
                  <div className="flex gap-2">
                    {proposal.verdict ? (
                      <Badge tone={VERDICT_TONE[proposal.verdict as keyof typeof VERDICT_TONE]}>
                        {proposal.verdict}
                      </Badge>
                    ) : (
                      <Badge>{proposal.status}</Badge>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
