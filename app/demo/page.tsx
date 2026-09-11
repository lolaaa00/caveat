'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import * as caveat from '@/lib/genlayer/caveat';
import {
  EVIDENCE_PATH,
  MANDATE_TEMPLATE,
  SCENARIOS,
  evidenceUrl,
  isEvidenceReachable,
  summarise,
} from '@/lib/fixtures/scenarios';
import type { Proposal } from '@/lib/types';
import { useTx } from '@/lib/wallet/useTx';
import { useWallet } from '@/lib/wallet/useWallet';
import { skinFor, skinVars } from '@/lib/ui/verdict';
import { Button, Empty, Panel, Tag } from '@/components/ui/primitives';
import { Reveal } from '@/components/ui/Reveal';
import { TxBanner } from '@/components/ui/TxBanner';

const EXPECT = { a: 'RECONFIRM', b: 'EXECUTE', c: 'BLOCK' } as const;
const VERDICT_TONE = { EXECUTE: 'lime', RECONFIRM: 'amber', BLOCK: 'crimson' } as const;

/**
 * Demo mode. The fixtures supply the mandate wording, the proposed actions and which
 * approved source to read — nothing else. Each scenario runs through the real contract,
 * and the verdict shown is whatever the contract returned.
 */
export default function DemoMode() {
  const wallet = useWallet();
  const { state, run, reset } = useTx();
  const [mandateId, setMandateId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Proposal>>({});
  const [source, setSource] = useState('');
  const [focused, setFocused] = useState<'a' | 'b' | 'c'>('a');
  // evidenceUrl() resolves against window.location.origin, which isn't known during
  // server rendering — deferring it past mount keeps the first client paint identical
  // to the server's, so React doesn't flag a hydration mismatch on the placeholder text.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const address = wallet.address;
  const connected = wallet.status === 'ready' && Boolean(address);
  const resolvedSource = source.trim() || evidenceUrl(EVIDENCE_PATH);
  const placeholderSource = source.trim() || (mounted ? evidenceUrl(EVIDENCE_PATH) : EVIDENCE_PATH);
  const reachable = source.trim() ? source.trim().startsWith('https://') : isEvidenceReachable();

  const prepare = async () => {
    if (!address) return;
    const result = await run('Create and activate demo mandate', async () => {
      const created = await caveat.createMandate(address, {
        agent: address, // one wallet acts as both principal and agent for the demo
        intentText: MANDATE_TEMPLATE.intentText,
        purposeText: MANDATE_TEMPLATE.purposeText,
        actionType: MANDATE_TEMPLATE.actionType,
        hardConstraintsJson: JSON.stringify(MANDATE_TEMPLATE.hardConstraints),
        semanticConditions: MANDATE_TEMPLATE.semanticConditions,
        approvedSourcesJson: JSON.stringify([resolvedSource]),
        evidenceQuestionsJson: JSON.stringify([
          { ...MANDATE_TEMPLATE.evidenceQuestion, source_url: resolvedSource },
        ]),
        reconfirmPolicy: MANDATE_TEMPLATE.reconfirmPolicy,
        expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      });
      const ids = await caveat.listMandateIds();
      const id = typeof created.returned === 'string' ? created.returned : ids[ids.length - 1];
      await caveat.activateMandate(address, id);
      return { ...created, id };
    });
    if (result?.id) setMandateId(result.id);
  };

  const runScenario = async (key: 'a' | 'b' | 'c') => {
    if (!address || !mandateId) return;
    const scenario = SCENARIOS.find((item) => item.key === key)!;
    await run(`${scenario.name} — checkpoint`, async () => {
      const submitted = await caveat.submitProposal(
        address,
        mandateId,
        JSON.stringify(scenario.payload),
        summarise(scenario.payload),
      );
      const ids = await caveat.proposalIdsForMandate(mandateId);
      const proposalId = typeof submitted.returned === 'string' ? submitted.returned : ids[ids.length - 1];
      await caveat.evaluateProposal(address, proposalId);
      const decided = await caveat.getProposal(proposalId);
      if (decided) setResults((current) => ({ ...current, [key]: decided }));
      return submitted;
    });
  };

  return (
    <div className="section" style={{ paddingTop: '2.5rem' }}>
      <div className="eyebrow">
        <span className="eb-dash" />
        Demo Fixture
      </div>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '0.75rem' }}>
        Three outcomes from one mandate
      </h1>
      <p style={{ fontSize: '0.9375rem', color: 'var(--color-muted)', lineHeight: 1.65, marginBottom: '1.75rem', maxWidth: 620 }}>
        The same authority, three proposed actions. Every verdict below is produced by the
        contract on chain: the fixtures only decide what is proposed and which approved source
        the validators read.
      </p>

      <div className="demo-bar" style={{ marginBottom: '2rem' }}>
        <span className="demo-lbl">Scenario</span>
        {SCENARIOS.map((scenario, i) => (
          <button
            key={scenario.key}
            className={`demo-chip ${focused === scenario.key ? 'on' : ''}`}
            style={skinVars(skinFor(results[scenario.key]?.verdict ?? EXPECT[scenario.key]))}
            onClick={() => setFocused(scenario.key)}
          >
            <span className="dc-num">0{i + 1}</span>
            {scenario.name.split(' — ')[1]?.toUpperCase() ?? scenario.name.toUpperCase()}
            <span className="dc-arrow">&rarr;</span>
            <span className="dc-expect">{results[scenario.key]?.verdict ?? EXPECT[scenario.key]}</span>
          </button>
        ))}
      </div>

      <TxBanner state={state} onDismiss={reset} />

      <Reveal>
        <Panel title="Step 1 — the mandate">
          <label>
            <span className="field-k">Approved evidence source</span>
            <input value={source} onChange={(event) => setSource(event.target.value)} placeholder={placeholderSource} className="input" />
          </label>
          {!reachable ? (
            <p style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--color-amber)', lineHeight: 1.5 }}>
              GenLayer validators fetch this URL themselves, so it must be publicly reachable over
              https. This origin is not. Deploy the app and set NEXT_PUBLIC_EVIDENCE_BASE_URL, or
              paste a public source above — otherwise evidence retrieval fails closed and every
              scenario returns RECONFIRM for the wrong reason.
            </p>
          ) : null}
          <p className="mandate-quote" style={{ marginTop: '0.875rem', marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>
            &#8220;{MANDATE_TEMPLATE.intentText}&#8221;
          </p>
          <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.875rem', flexWrap: 'wrap' }}>
            <Button tone="crimson" disabled={!connected || state.phase === 'pending'} onClick={() => void prepare()}>
              {mandateId ? 'Create Another Demo Mandate' : 'Create And Activate Mandate'}
            </Button>
            {mandateId ? (
              <Link href={`/mandates/${mandateId}`} className="hash" style={{ color: 'var(--color-crimson-hot)' }}>
                {mandateId} is ACTIVE
              </Link>
            ) : null}
            {!connected ? <span style={{ fontSize: '0.72rem', color: 'var(--color-faint)' }}>Connect a wallet to run the demo.</span> : null}
          </div>
        </Panel>
      </Reveal>

      <div className="grid-evidence" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: '1.25rem' }}>
        {SCENARIOS.map((scenario, i) => {
          const result = results[scenario.key];
          const skin = skinFor(result?.verdict ?? '');
          return (
            <Reveal key={scenario.key} delay={i * 0.06}>
              <div className="panel" style={result ? skinVars(skin) : undefined}>
                <div className="panel-head">{scenario.name}</div>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text)', lineHeight: 1.55 }}>{scenario.premise}</p>
                <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--color-faint)', lineHeight: 1.5 }}>
                  {scenario.exercises}
                </p>

                <div className="evi-source" style={{ marginTop: '0.875rem', display: 'block' }}>
                  <div className="field-k" style={{ marginBottom: '0.3rem' }}>
                    Proposed action
                  </div>
                  <p className="hash">{summarise(scenario.payload)}</p>
                </div>

                <div style={{ marginTop: '0.875rem' }}>
                  <Button disabled={!connected || !mandateId || state.phase === 'pending'} onClick={() => void runScenario(scenario.key)}>
                    Run Checkpoint
                  </Button>
                </div>

                {result ? (
                  <div style={{ marginTop: '1rem' }}>
                    <Tag tone={VERDICT_TONE[result.verdict as keyof typeof VERDICT_TONE]}>{result.verdict}</Tag>
                    <p style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--color-muted)' }}>{result.reason_code}</p>
                    <Link href={`/proposals/${result.proposal_id}`} className="hash" style={{ marginTop: '0.5rem', display: 'inline-block', color: 'var(--color-crimson-hot)' }}>
                      open checkpoint {result.proposal_id} &rarr;
                    </Link>
                  </div>
                ) : (
                  <p style={{ marginTop: '1rem', fontSize: '0.72rem', color: 'var(--color-faint)' }}>
                    No verdict yet. Nothing is displayed until the contract decides.
                  </p>
                )}
              </div>
            </Reveal>
          );
        })}
      </div>

      {Object.keys(results).length === 0 ? (
        <div style={{ marginTop: '2rem' }}>
          <Empty>Run the scenarios above to see EXECUTE, RECONFIRM and BLOCK from one mandate.</Empty>
        </div>
      ) : null}
    </div>
  );
}
