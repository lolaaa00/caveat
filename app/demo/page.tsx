'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import * as caveat from '@/lib/genlayer/caveat';
import {
  EVIDENCE_PATH,
  MANDATE_TEMPLATE,
  SCENARIOS,
  evidenceUrl,
  flight,
  isEvidenceReachable,
  summarise,
} from '@/lib/fixtures/scenarios';
import { isBusy } from '@/lib/types';
import type { Proposal } from '@/lib/types';
import { explorerTx } from '@/lib/config';
import { useTx } from '@/lib/wallet/useTx';
import { useWallet } from '@/lib/wallet/useWallet';
import { skinFor, skinVars } from '@/lib/ui/verdict';
import { Button, Empty, Panel, Tag } from '@/components/ui/primitives';
import { Reveal } from '@/components/ui/Reveal';
import { TxBanner } from '@/components/ui/TxBanner';

const EXPECT = { a: 'RECONFIRM', b: 'EXECUTE', c: 'BLOCK' } as const;
const VERDICT_TONE = { EXECUTE: 'lime', RECONFIRM: 'amber', BLOCK: 'crimson' } as const;

/**
 * A completed, real on-chain run — not this session's live state. Values copied verbatim
 * from artifacts/e2e.studio_devnet.json (source of truth; re-verify there before editing
 * this). Shown so a visitor without a connected wallet can see genuine proof immediately,
 * instead of three empty "no verdict yet" cards. Never presented as current contract
 * state — every entry is explicitly dated and links to its own explorer transaction.
 */
const PROVEN_RESULTS = {
  mandateId: 'MND-0012',
  ranAt: '2026-09-15T21:03:34Z',
  contract: '0x0B063A6Fb5aFA78bc8C1F9C77abf73cb5Ff7Dd14',
  rows: [
    {
      key: 'a' as const,
      name: 'A · Context drift',
      proposal: 'CAV-0014',
      verdict: 'RECONFIRM' as const,
      tx: '0xc2f522fbda84b719ecfc8e685b3c6f1aa57da91601bfc4b4dfc16cd16509d93f',
    },
    {
      key: 'b' as const,
      name: 'B · Intent still satisfied',
      proposal: 'CAV-0015',
      verdict: 'EXECUTE' as const,
      tx: '0x37ac4e365ccb88f85d2c84bd7fddd067d691a0d02e484b97fef67f2b5c3ec92e',
    },
    {
      key: 'c' as const,
      name: 'C · Explicit prohibition',
      proposal: 'CAV-0018',
      verdict: 'BLOCK' as const,
      tx: '0xb3c83c9c66b814138273cd8e6118c84c86a400e8c2fd706d34080378e7e1f55b',
    },
  ],
};

/**
 * Demo mode. The fixtures supply the mandate wording, the proposed actions and which
 * approved source to read — nothing else. Each scenario runs through the real contract,
 * and the verdict shown is whatever the contract returned.
 */
export default function DemoMode() {
  const wallet = useWallet();
  const { state, run, reset, reportPhase } = useTx();
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
  // Same SSR-vs-client mismatch as placeholderSource above: isEvidenceReachable() also
  // resolves window.location.origin, so it must stay gated behind `mounted` too — this
  // value toggles an entire conditional block, not just text, so an unguarded mismatch
  // here previously discarded and fully re-rendered the whole page (React error #418).
  const reachable = source.trim() ? source.trim().startsWith('https://') : mounted && isEvidenceReachable();

  const prepare = async () => {
    if (!address) return;
    const result = await run('Create and activate demo mandate', async () => {
      const created = await caveat.createMandate(
        address,
        {
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
        },
        reportPhase,
      );
      const ids = await caveat.listMandateIds();
      const id = typeof created.returned === 'string' ? created.returned : ids[ids.length - 1];
      await caveat.activateMandate(address, id, reportPhase);
      return { ...created, id };
    });
    if (result?.id) setMandateId(result.id);
  };

  const runScenario = async (key: 'a' | 'b' | 'c') => {
    if (!address || !mandateId) return;
    const scenario = SCENARIOS.find((item) => item.key === key)!;
    await run(`${scenario.name} · checkpoint`, async () => {
      const submitted = await caveat.submitProposal(
        address,
        mandateId,
        JSON.stringify(scenario.payload),
        summarise(scenario.payload),
        reportPhase,
      );
      const ids = await caveat.proposalIdsForMandate(mandateId);
      const proposalId = typeof submitted.returned === 'string' ? submitted.returned : ids[ids.length - 1];
      await caveat.evaluateProposal(address, proposalId, reportPhase);
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

      <Reveal>
        <Panel title="Proven live results · no wallet needed">
          <p style={{ fontSize: '0.78rem', color: 'var(--color-muted)', lineHeight: 1.6, marginBottom: '1rem' }}>
            A completed run of all three scenarios from one mandate, on the currently
            deployed contract — real validators, real evidence fetch, real consensus. This
            is historical proof, not this page's live state: run the scenarios below
            yourself with a connected wallet for a fresh instance of the same outcomes.
          </p>
          <div style={{ display: 'grid', gap: '0.625rem' }}>
            {PROVEN_RESULTS.rows.map((row) => (
              <div
                key={row.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  padding: '0.625rem 0.75rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: '0.5rem',
                }}
              >
                <span style={{ fontSize: '0.8125rem' }}>
                  {row.name} <span className="hash">{row.proposal}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                  <Tag tone={VERDICT_TONE[row.verdict]}>{row.verdict}</Tag>
                  <a
                    href={explorerTx(row.tx)}
                    target="_blank"
                    rel="noreferrer"
                    className="hash"
                    style={{ color: 'var(--color-crimson-hot)' }}
                  >
                    view tx &rarr;
                  </a>
                </span>
              </div>
            ))}
          </div>
          <p style={{ marginTop: '0.875rem', fontSize: '0.7rem', color: 'var(--color-faint)' }}>
            Mandate {PROVEN_RESULTS.mandateId} · run {PROVEN_RESULTS.ranAt} · contract{' '}
            <span className="hash">{PROVEN_RESULTS.contract}</span>
          </p>
        </Panel>
      </Reveal>

      <div className="demo-bar" style={{ marginBottom: '2rem', marginTop: '2rem' }}>
        <span className="demo-lbl">Scenario</span>
        {SCENARIOS.map((scenario, i) => (
          <button
            key={scenario.key}
            className={`demo-chip ${focused === scenario.key ? 'on' : ''}`}
            style={skinVars(skinFor(results[scenario.key]?.verdict ?? EXPECT[scenario.key]))}
            onClick={() => setFocused(scenario.key)}
          >
            <span className="dc-num">0{i + 1}</span>
            {scenario.name.split(' · ')[1]?.toUpperCase() ?? scenario.name.toUpperCase()}
            <span className="dc-arrow">&rarr;</span>
            <span className="dc-expect">{results[scenario.key]?.verdict ?? EXPECT[scenario.key]}</span>
          </button>
        ))}
      </div>

      <TxBanner state={state} onDismiss={reset} />

      <Reveal>
        <Panel title="Step 1 · the mandate">
          <label>
            <span className="field-k">Approved evidence source</span>
            <input value={source} onChange={(event) => setSource(event.target.value)} placeholder={placeholderSource} className="input" />
          </label>
          {!reachable ? (
            <p style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--color-amber)', lineHeight: 1.5 }}>
              GenLayer validators fetch this URL themselves, so it must be publicly reachable over
              https. This origin is not. Deploy the app and set NEXT_PUBLIC_EVIDENCE_BASE_URL, or
              paste a public source above; otherwise evidence retrieval fails closed and every
              scenario returns RECONFIRM for the wrong reason.
            </p>
          ) : null}
          <p className="mandate-quote" style={{ marginTop: '0.875rem', marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>
            &#8220;{MANDATE_TEMPLATE.intentText}&#8221;
          </p>
          <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.875rem', flexWrap: 'wrap' }}>
            <Button tone="crimson" disabled={!connected || isBusy(state.phase)} onClick={() => void prepare()}>
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

      <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginTop: '1.25rem' }}>
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
                  <Button disabled={!connected || !mandateId || isBusy(state.phase)} onClick={() => void runScenario(scenario.key)}>
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

      <div className="sec-lbl" style={{ marginTop: '2.5rem' }}>
        Try To Break It Yourself
      </div>
      <Reveal>
        <TryToBreakIt address={address} mandateId={mandateId} connected={connected} />
      </Reveal>
    </div>
  );
}

/**
 * The three scenarios above are pre-written. This isn't: pick any arrival time, price
 * and refundability, and the contract decides for real, live evidence and all — the
 * same way it would for a scenario nobody wrote in advance.
 */
const TryToBreakIt = ({
  address,
  mandateId,
  connected,
}: {
  address: string | null;
  mandateId: string | null;
  connected: boolean;
}) => {
  const { state, run, reset, reportPhase } = useTx();
  const [arrival, setArrival] = useState('09:15');
  const [price, setPrice] = useState('880');
  const [refundable, setRefundable] = useState(true);
  const [result, setResult] = useState<Proposal | null>(null);

  const payload = flight({
    arrival_local_time: arrival,
    price_eur: Number(price) || 0,
    refundable,
  });

  const tryIt = async () => {
    if (!address || !mandateId) return;
    setResult(null);
    await run('Custom proposal · checkpoint', async () => {
      const submitted = await caveat.submitProposal(
        address,
        mandateId,
        JSON.stringify(payload),
        summarise(payload),
        reportPhase,
      );
      const ids = await caveat.proposalIdsForMandate(mandateId);
      const proposalId = typeof submitted.returned === 'string' ? submitted.returned : ids[ids.length - 1];
      await caveat.evaluateProposal(address, proposalId, reportPhase);
      const decided = await caveat.getProposal(proposalId);
      setResult(decided);
      return submitted;
    });
  };

  return (
    <div className="panel" style={result ? skinVars(skinFor(result.verdict)) : undefined}>
      <div className="panel-head">Build your own proposal</div>
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', lineHeight: 1.6, marginBottom: '1rem' }}>
        Same mandate as above, same live evidence source. Pick numbers nobody scripted for
        you and submit them against the real contract — there is no scenario key backing
        this one, and no verdict shown until the checkpoint actually decides.
      </p>

      <TxBanner state={state} onDismiss={reset} />

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <label>
          <span className="field-k">Arrival time (24h)</span>
          <input value={arrival} onChange={(event) => setArrival(event.target.value)} placeholder="HH:MM" className="input" />
        </label>
        <label>
          <span className="field-k">Price (EUR)</span>
          <input value={price} onChange={(event) => setPrice(event.target.value.replace(/[^0-9]/g, ''))} className="input" />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
          <input type="checkbox" checked={refundable} onChange={(event) => setRefundable(event.target.checked)} />
          <span style={{ fontSize: '0.8125rem' }}>Refundable</span>
        </label>
      </div>

      <div className="evi-source" style={{ marginTop: '1rem', display: 'block' }}>
        <div className="field-k" style={{ marginBottom: '0.3rem' }}>
          Proposed action
        </div>
        <p className="hash">{summarise(payload)}</p>
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.875rem', flexWrap: 'wrap' }}>
        <Button
          tone="crimson"
          disabled={!connected || !mandateId || isBusy(state.phase)}
          onClick={() => void tryIt()}
        >
          Submit And Judge
        </Button>
        {!mandateId ? (
          <span style={{ fontSize: '0.72rem', color: 'var(--color-faint)' }}>
            Create the demo mandate above first.
          </span>
        ) : null}
      </div>

      {result ? (
        <div style={{ marginTop: '1.25rem' }}>
          <Tag tone={VERDICT_TONE[result.verdict as keyof typeof VERDICT_TONE]}>{result.verdict}</Tag>
          <p style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--color-text)' }}>
            {result.short_rationale}
          </p>
          <Link href={`/proposals/${result.proposal_id}`} className="hash" style={{ marginTop: '0.5rem', display: 'inline-block', color: 'var(--color-crimson-hot)' }}>
            open checkpoint {result.proposal_id} &rarr;
          </Link>
        </div>
      ) : null}
    </div>
  );
};
