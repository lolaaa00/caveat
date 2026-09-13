'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import * as caveat from '@/lib/genlayer/caveat';
import { EVIDENCE_PATH, MANDATE_TEMPLATE, evidenceUrl, isEvidenceReachable } from '@/lib/fixtures/scenarios';
import { useTx } from '@/lib/wallet/useTx';
import { useWallet } from '@/lib/wallet/useWallet';
import { Button, Field, Panel } from '@/components/ui/primitives';
import { Reveal } from '@/components/ui/Reveal';
import { TxBanner } from '@/components/ui/TxBanner';

const thirtyDaysOut = () => {
  const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 16);
};

export default function NewMandate() {
  const router = useRouter();
  const wallet = useWallet();
  const { state, run, reset } = useTx();

  const [agent, setAgent] = useState('');
  const [intent, setIntent] = useState(MANDATE_TEMPLATE.intentText);
  const [purpose, setPurpose] = useState(MANDATE_TEMPLATE.purposeText);
  const [semantic, setSemantic] = useState(MANDATE_TEMPLATE.semanticConditions);
  const [budget, setBudget] = useState('900');
  const [destination, setDestination] = useState('AMS');
  const [refundableOnly, setRefundableOnly] = useState(true);
  const [source, setSource] = useState('');
  const [question, setQuestion] = useState(MANDATE_TEMPLATE.evidenceQuestion.question);
  const [fallback, setFallback] = useState('');
  const [expiry, setExpiry] = useState(thirtyDaysOut());
  const [activate, setActivate] = useState(true);
  // evidenceUrl() resolves against window.location.origin, which isn't known during
  // server rendering — deferring it past mount keeps the first client paint identical
  // to the server's, so React doesn't flag a hydration mismatch on the placeholder text.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const resolvedSource = source.trim() || evidenceUrl(EVIDENCE_PATH);
  const placeholderSource = source.trim() || (mounted ? evidenceUrl(EVIDENCE_PATH) : EVIDENCE_PATH);
  const connected = wallet.status === 'ready' && Boolean(wallet.address);

  const submit = async () => {
    if (!wallet.address) return;

    const hardConstraints = [
      { label: 'Budget', field: 'price_eur', op: 'lte', value: Number(budget) },
      { label: 'Destination', field: 'arrival_airport', op: 'eq', value: destination.trim() },
      ...(refundableOnly ? [{ label: 'Refundability', field: 'refundable', op: 'is_true' }] : []),
    ];
    const evidenceQuestions = [
      {
        ...MANDATE_TEMPLATE.evidenceQuestion,
        question,
        source_url: resolvedSource,
        fallback_claim: fallback.trim(),
      },
    ];

    const result = await run('Create mandate', async () => {
      const created = await caveat.createMandate(wallet.address!, {
        agent: agent.trim(),
        intentText: intent,
        purposeText: purpose,
        actionType: MANDATE_TEMPLATE.actionType,
        hardConstraintsJson: JSON.stringify(hardConstraints),
        semanticConditions: semantic,
        approvedSourcesJson: JSON.stringify([resolvedSource]),
        evidenceQuestionsJson: JSON.stringify(evidenceQuestions),
        reconfirmPolicy: MANDATE_TEMPLATE.reconfirmPolicy,
        expiresAt: Math.floor(new Date(expiry).getTime() / 1000),
      });

      const ids = await caveat.listMandateIds();
      const mandateId = typeof created.returned === 'string' ? created.returned : ids[ids.length - 1];
      if (activate && mandateId) {
        await caveat.activateMandate(wallet.address!, mandateId);
      }
      return { ...created, mandateId };
    });

    if (result && 'mandateId' in result && result.mandateId) {
      router.push(`/mandates/${result.mandateId}`);
    }
  };

  return (
    <div className="section" style={{ paddingTop: '2.5rem', maxWidth: 760 }}>
      <div className="eyebrow">
        <span className="eb-dash" />
        Create Mandate
      </div>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '0.75rem' }}>
        Grant an agent bounded authority
      </h1>
      <p style={{ fontSize: '0.9375rem', color: 'var(--color-muted)', lineHeight: 1.65, marginBottom: '2rem', maxWidth: 560 }}>
        Your wording is preserved exactly as written. Hard constraints are checked
        deterministically; the purpose and semantic condition are what the checkpoint reasons
        about later. Once activated, this policy is frozen.
      </p>

      <TxBanner state={state} onDismiss={reset} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <Reveal>
          <Panel title="Intent, in your own words">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label>
                <span className="field-k">Original intent</span>
                <textarea value={intent} onChange={(event) => setIntent(event.target.value)} rows={3} className="input" />
              </label>
              <label>
                <span className="field-k">Purpose · why this authority is being granted</span>
                <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} rows={2} className="input" />
              </label>
              <label>
                <span className="field-k">Semantic condition</span>
                <textarea value={semantic} onChange={(event) => setSemantic(event.target.value)} rows={2} className="input" />
              </label>
            </div>
          </Panel>
        </Reveal>

        <Reveal delay={0.04}>
          <Panel title="Hard constraints · decided deterministically, before any model runs">
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              <label>
                <span className="field-k">Budget ceiling (EUR)</span>
                <input value={budget} onChange={(event) => setBudget(event.target.value.replace(/[^0-9]/g, ''))} className="input" />
              </label>
              <label>
                <span className="field-k">Destination (IATA)</span>
                <input value={destination} onChange={(event) => setDestination(event.target.value.toUpperCase())} className="input" />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
                <input type="checkbox" checked={refundableOnly} onChange={(event) => setRefundableOnly(event.target.checked)} />
                <span style={{ fontSize: '0.8125rem' }}>Refundable fares only</span>
              </label>
            </div>
          </Panel>
        </Reveal>

        <Reveal delay={0.08}>
          <Panel title="Evidence policy · frozen on activation, never set by the agent">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label>
                <span className="field-k">Approved source</span>
                <input value={source} onChange={(event) => setSource(event.target.value)} placeholder={placeholderSource} className="input" />
              </label>
              {!isEvidenceReachable() && !source.trim() ? (
                <p style={{ fontSize: '0.72rem', color: 'var(--color-amber)', lineHeight: 1.5 }}>
                  This origin is not publicly reachable, so GenLayer validators cannot fetch it.
                  Set NEXT_PUBLIC_EVIDENCE_BASE_URL to a deployed URL, or paste a public https
                  source above.
                </p>
              ) : null}
              <label>
                <span className="field-k">Evidence question</span>
                <input value={question} onChange={(event) => setQuestion(event.target.value)} className="input" />
              </label>
              <label>
                <span className="field-k">
                  Fallback claim (optional): recorded as FALLBACK and can never authorize execution
                </span>
                <input
                  value={fallback}
                  onChange={(event) => setFallback(event.target.value)}
                  placeholder="leave empty to fail closed instead"
                  className="input"
                />
              </label>
            </div>
          </Panel>
        </Reveal>

        <Reveal delay={0.12}>
          <Panel title="Agent and expiry">
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <label>
                <span className="field-k">Authorized agent address</span>
                <input value={agent} onChange={(event) => setAgent(event.target.value)} placeholder="0x…" className="input" />
              </label>
              <label>
                <span className="field-k">Expires at</span>
                <input type="datetime-local" value={expiry} onChange={(event) => setExpiry(event.target.value)} className="input" />
              </label>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
              <input type="checkbox" checked={activate} onChange={(event) => setActivate(event.target.checked)} />
              <span style={{ fontSize: '0.8125rem' }}>
                Activate immediately (freezes the policy and computes the commitment)
              </span>
            </label>
          </Panel>
        </Reveal>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', paddingTop: '0.5rem' }}>
          <Button
            tone="crimson"
            disabled={!connected || state.phase === 'pending' || !agent.trim() || !intent.trim()}
            onClick={() => void submit()}
          >
            {state.phase === 'pending' ? 'Awaiting consensus…' : 'Create Mandate'}
          </Button>
          {!connected ? (
            <span style={{ fontSize: '0.72rem', color: 'var(--color-faint)' }}>
              Connect the principal wallet to sign this transaction.
            </span>
          ) : (
            <Field label="Principal">
              <span className="hash">{wallet.address}</span>
            </Field>
          )}
        </div>
      </div>
    </div>
  );
}
