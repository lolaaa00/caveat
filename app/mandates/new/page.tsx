'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import * as caveat from '@/lib/genlayer/caveat';
import {
  EVIDENCE_PATH,
  MANDATE_TEMPLATE,
  evidenceUrl,
  isEvidenceReachable,
} from '@/lib/fixtures/scenarios';
import { useTx } from '@/lib/wallet/useTx';
import { useWallet } from '@/lib/wallet/useWallet';
import { Button, Field, Panel } from '@/components/ui/primitives';
import { TxBanner } from '@/components/ui/TxBanner';

const inputClass =
  'datum mt-1 w-full border border-line bg-surface px-2.5 py-2 text-[12px] text-ink placeholder:text-ink-faint';

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

  const resolvedSource = source.trim() || evidenceUrl(EVIDENCE_PATH);
  const connected = wallet.status === 'ready' && Boolean(wallet.address);

  const submit = async () => {
    if (!wallet.address) return;

    const hardConstraints = [
      { label: 'Budget', field: 'price_eur', op: 'lte', value: Number(budget) },
      { label: 'Destination', field: 'arrival_airport', op: 'eq', value: destination.trim() },
      ...(refundableOnly
        ? [{ label: 'Refundability', field: 'refundable', op: 'is_true' }]
        : []),
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
      const mandateId =
        typeof created.returned === 'string' ? created.returned : ids[ids.length - 1];
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
    <div className="max-w-3xl space-y-6">
      <div>
        <div className="label mb-2">Create mandate</div>
        <h1 className="text-[22px] text-ink">Grant an agent bounded authority</h1>
        <p className="mt-2 text-[13px] text-ink-dim">
          Your wording is preserved exactly as written. Hard constraints are checked
          deterministically; the purpose and semantic condition are what the checkpoint reasons
          about later. Once activated, this policy is frozen.
        </p>
      </div>

      <TxBanner state={state} onDismiss={reset} />

      <Panel title="Intent, in your own words">
        <div className="space-y-4">
          <label className="block">
            <span className="label">Original intent</span>
            <textarea
              value={intent}
              onChange={(event) => setIntent(event.target.value)}
              rows={3}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="label">Purpose — why this authority is being granted</span>
            <textarea
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              rows={2}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="label">Semantic condition</span>
            <textarea
              value={semantic}
              onChange={(event) => setSemantic(event.target.value)}
              rows={2}
              className={inputClass}
            />
          </label>
        </div>
      </Panel>

      <Panel title="Hard constraints — decided deterministically, before any model runs">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="label">Budget ceiling (EUR)</span>
            <input
              value={budget}
              onChange={(event) => setBudget(event.target.value.replace(/[^0-9]/g, ''))}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="label">Destination (IATA)</span>
            <input
              value={destination}
              onChange={(event) => setDestination(event.target.value.toUpperCase())}
              className={inputClass}
            />
          </label>
          <label className="mt-5 flex items-center gap-2">
            <input
              type="checkbox"
              checked={refundableOnly}
              onChange={(event) => setRefundableOnly(event.target.checked)}
            />
            <span className="text-[12px] text-ink">Refundable fares only</span>
          </label>
        </div>
      </Panel>

      <Panel title="Evidence policy — frozen on activation, never set by the agent">
        <div className="space-y-4">
          <label className="block">
            <span className="label">Approved source</span>
            <input
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder={resolvedSource}
              className={inputClass}
            />
          </label>
          {!isEvidenceReachable() && !source.trim() ? (
            <p className="text-[12px] text-reconfirm">
              This origin is not publicly reachable, so GenLayer validators cannot fetch it. Set
              NEXT_PUBLIC_EVIDENCE_BASE_URL to a deployed URL, or paste a public https source
              above.
            </p>
          ) : null}
          <label className="block">
            <span className="label">Evidence question</span>
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="label">
              Fallback claim (optional) — recorded as FALLBACK and can never authorize execution
            </span>
            <input
              value={fallback}
              onChange={(event) => setFallback(event.target.value)}
              placeholder="leave empty to fail closed instead"
              className={inputClass}
            />
          </label>
        </div>
      </Panel>

      <Panel title="Agent and expiry">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Authorized agent address</span>
            <input
              value={agent}
              onChange={(event) => setAgent(event.target.value)}
              placeholder="0x…"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="label">Expires at</span>
            <input
              type="datetime-local"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <label className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            checked={activate}
            onChange={(event) => setActivate(event.target.checked)}
          />
          <span className="text-[12px] text-ink">
            Activate immediately (freezes the policy and computes the commitment)
          </span>
        </label>
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          tone="primary"
          disabled={!connected || state.phase === 'pending' || !agent.trim() || !intent.trim()}
          onClick={() => void submit()}
        >
          {state.phase === 'pending' ? 'Awaiting consensus…' : 'Create mandate'}
        </Button>
        {!connected ? (
          <span className="text-[12px] text-ink-faint">
            Connect the principal wallet to sign this transaction.
          </span>
        ) : (
          <Field label="Principal">
            <span className="datum text-[12px] text-ink-dim">{wallet.address}</span>
          </Field>
        )}
      </div>
    </div>
  );
}
