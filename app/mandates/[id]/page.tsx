'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { explorerAddress } from '@/lib/config';
import * as caveat from '@/lib/genlayer/caveat';
import { useChainData } from '@/lib/genlayer/useChainData';
import { flight, summarise } from '@/lib/fixtures/scenarios';
import { isBusy } from '@/lib/types';
import { useTx } from '@/lib/wallet/useTx';
import { useWallet } from '@/lib/wallet/useWallet';
import { Button, Empty, Field, Panel, RowLink, Tag } from '@/components/ui/primitives';
import { Reveal } from '@/components/ui/Reveal';
import { TxBanner } from '@/components/ui/TxBanner';

const VERDICT_TONE = { EXECUTE: 'lime', RECONFIRM: 'amber', BLOCK: 'crimson' } as const;
const when = (seconds: number) =>
  seconds ? new Date(seconds * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '-';

export default function MandateDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const wallet = useWallet();
  const { state, run, reset, reportPhase } = useTx();
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
    return (
      <div className="section">
        <div className="banner banner-error">{error}</div>
      </div>
    );
  }
  if (loading || !mandate) {
    return (
      <div className="section">
        <Empty>{loading ? 'Reading mandate from the contract…' : 'Mandate not found.'}</Empty>
      </div>
    );
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
        reportPhase,
      );
      const ids = await caveat.proposalIdsForMandate(mandate.mandate_id);
      return { ...created, proposalId: typeof created.returned === 'string' ? created.returned : ids[ids.length - 1] };
    });
    if (result?.proposalId) router.push(`/proposals/${result.proposalId}`);
  };

  return (
    <div className="section" style={{ paddingTop: '2.5rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <div className="mono-id">{mandate.mandate_id}</div>
          <h1 style={{ marginTop: '0.4rem', maxWidth: 640, fontSize: '1.375rem', lineHeight: 1.35, fontWeight: 700 }}>
            {mandate.intent_text}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Tag tone={mandate.status === 'ACTIVE' ? 'lime' : 'neutral'}>{mandate.status}</Tag>
          {mandate.reconfirm_count > 0 ? <Tag tone="amber">reconfirmed &times;{mandate.reconfirm_count}</Tag> : null}
        </div>
      </div>

      <TxBanner state={state} onDismiss={reset} />

      <Reveal className="grid-2" style={{ alignItems: 'start' }}>
        <Panel title="Mandate">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <Field label="Purpose">{mandate.purpose_text || '-'}</Field>
            <Field label="Semantic conditions">{mandate.semantic_conditions || '-'}</Field>
            <Field label="Reconfirmation policy">{mandate.reconfirm_policy || '-'}</Field>
            <Field label="Hard constraints">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {mandate.hard_constraints.map((constraint) => (
                  <div key={constraint.label} className="hash">
                    {constraint.label}: {constraint.field} {constraint.op}{' '}
                    {constraint.value === undefined ? '' : JSON.stringify(constraint.value)}
                  </div>
                ))}
              </div>
            </Field>
            <Field label="Approved evidence sources">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {mandate.approved_sources.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="hash" style={{ color: 'var(--color-crimson-hot)' }}>
                    {url}
                  </a>
                ))}
              </div>
            </Field>
            <Field label="Evidence questions">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {mandate.evidence_questions.map((question) => (
                  <div key={question.qid} style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                    {question.question}
                    {question.fallback_claim ? (
                      <span style={{ color: 'var(--color-amber)' }}> &middot; fallback &ldquo;{question.fallback_claim}&rdquo;</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </Field>
          </div>
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <Panel title="Parties and window">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <Field label="Principal">
                <a href={explorerAddress(mandate.principal)} target="_blank" rel="noreferrer" className="hash" style={{ color: 'var(--color-crimson-hot)' }}>
                  {mandate.principal}
                </a>
              </Field>
              <Field label="Authorized agent">
                <span className="hash">{mandate.agent}</span>
              </Field>
              <Field label="Created">{when(mandate.created_at)}</Field>
              <Field label="Expires">{when(mandate.expires_at)}</Field>
              <Field label="Policy commitment">
                <span className="hash">{mandate.commitment || 'not frozen until activation'}</span>
              </Field>
            </div>
          </Panel>

          {isPrincipal ? (
            <Panel title="Principal controls">
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {mandate.status === 'DRAFT' ? (
                  <Button
                    tone="lime"
                    disabled={isBusy(state.phase)}
                    onClick={() =>
                      void run('Activate mandate', async () => {
                        const result = await caveat.activateMandate(address!, mandate.mandate_id, reportPhase);
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
                    tone="crimson"
                    disabled={isBusy(state.phase)}
                    onClick={() =>
                      void run('Revoke mandate', async () => {
                        const result = await caveat.revokeMandate(address!, mandate.mandate_id, reportPhase);
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
      </Reveal>

      {mandate.status === 'ACTIVE' && isAgent ? (
        <Reveal>
          <Panel title="Submit a proposal as the mandated agent" style={{ marginTop: '1.25rem' }}>
            <textarea
              value={payloadText}
              onChange={(event) => setPayloadText(event.target.value)}
              rows={12}
              className="input"
            />
            <div style={{ marginTop: '0.875rem' }}>
              <Button tone="crimson" disabled={isBusy(state.phase)} onClick={() => void submitProposal()}>
                Submit proposal
              </Button>
            </div>
          </Panel>
        </Reveal>
      ) : null}

      <Reveal>
        <Panel title="Proposals against this mandate" style={{ marginTop: '1.25rem' }}>
          {proposals.length === 0 ? (
            <Empty>No proposals yet.</Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {proposals.map((proposal) => (
                <RowLink key={proposal.proposal_id} href={`/proposals/${proposal.proposal_id}`}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <div>
                      <div className="mono-id">{proposal.proposal_id}</div>
                      <p style={{ marginTop: '0.3rem', fontSize: '0.8125rem', color: 'var(--color-text)' }}>
                        {proposal.action_summary}
                      </p>
                    </div>
                    {proposal.verdict ? (
                      <Tag tone={VERDICT_TONE[proposal.verdict as keyof typeof VERDICT_TONE]}>{proposal.verdict}</Tag>
                    ) : (
                      <Tag>{proposal.status}</Tag>
                    )}
                  </div>
                </RowLink>
              ))}
            </div>
          )}
        </Panel>
      </Reveal>
    </div>
  );
}
