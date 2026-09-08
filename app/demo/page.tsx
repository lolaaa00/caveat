'use client';

import Link from 'next/link';
import { useState } from 'react';
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
import { Badge, Button, Empty, Mono, Panel } from '@/components/ui/primitives';
import { TxBanner } from '@/components/ui/TxBanner';

const TONE = { EXECUTE: 'execute', RECONFIRM: 'reconfirm', BLOCK: 'block' } as const;

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

  const address = wallet.address;
  const connected = wallet.status === 'ready' && Boolean(address);
  const resolvedSource = source.trim() || evidenceUrl(EVIDENCE_PATH);
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
      const proposalId =
        typeof submitted.returned === 'string' ? submitted.returned : ids[ids.length - 1];
      await caveat.evaluateProposal(address, proposalId);
      const decided = await caveat.getProposal(proposalId);
      if (decided) setResults((current) => ({ ...current, [key]: decided }));
      return submitted;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="label mb-2">Demo mode</div>
        <h1 className="text-[22px] text-ink">Three outcomes from one mandate</h1>
        <p className="mt-2 max-w-2xl text-[13px] text-ink-dim">
          The same authority, three proposed actions. Every verdict below is produced by the
          contract on chain: the fixtures only decide what is proposed and which approved source
          the validators read.
        </p>
      </div>

      <TxBanner state={state} onDismiss={reset} />

      <Panel title="Step 1 — the mandate">
        <label className="block">
          <span className="label">Approved evidence source</span>
          <input
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder={resolvedSource}
            className="datum mt-1 w-full border border-line bg-surface px-2.5 py-2 text-[12px] text-ink"
          />
        </label>
        {!reachable ? (
          <p className="mt-2 text-[12px] text-reconfirm">
            GenLayer validators fetch this URL themselves, so it must be publicly reachable over
            https. This origin is not. Deploy the app and set NEXT_PUBLIC_EVIDENCE_BASE_URL, or
            paste a public source above — otherwise evidence retrieval fails closed and every
            scenario returns RECONFIRM for the wrong reason.
          </p>
        ) : null}
        <p className="mt-3 max-w-2xl text-[13px] text-ink">“{MANDATE_TEMPLATE.intentText}”</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            tone="primary"
            disabled={!connected || state.phase === 'pending'}
            onClick={() => void prepare()}
          >
            {mandateId ? 'Create another demo mandate' : 'Create and activate mandate'}
          </Button>
          {mandateId ? (
            <Link href={`/mandates/${mandateId}`} className="datum text-[12px] text-signal hover:underline">
              {mandateId} is ACTIVE
            </Link>
          ) : null}
          {!connected ? (
            <span className="text-[12px] text-ink-faint">Connect a wallet to run the demo.</span>
          ) : null}
        </div>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-3">
        {SCENARIOS.map((scenario) => {
          const result = results[scenario.key];
          return (
            <Panel key={scenario.key} title={scenario.name}>
              <p className="text-[13px] text-ink">{scenario.premise}</p>
              <p className="mt-2 text-[12px] text-ink-faint">{scenario.exercises}</p>

              <div className="mt-3 border border-line bg-surface p-3">
                <div className="label mb-1">Proposed action</div>
                <p className="datum text-[12px] text-ink-dim">{summarise(scenario.payload)}</p>
              </div>

              <div className="mt-3">
                <Button
                  disabled={!connected || !mandateId || state.phase === 'pending'}
                  onClick={() => void runScenario(scenario.key)}
                >
                  Run checkpoint
                </Button>
              </div>

              {result ? (
                <div className="mt-4">
                  <Badge tone={TONE[result.verdict as keyof typeof TONE]}>{result.verdict}</Badge>
                  <p className="mt-2 text-[12px] text-ink-dim">{result.reason_code}</p>
                  <Link
                    href={`/proposals/${result.proposal_id}`}
                    className="datum mt-2 inline-block text-[11px] text-signal hover:underline"
                  >
                    open checkpoint {result.proposal_id} →
                  </Link>
                </div>
              ) : (
                <p className="mt-4 text-[12px] text-ink-faint">
                  No verdict yet. Nothing is displayed until the contract decides.
                </p>
              )}
            </Panel>
          );
        })}
      </div>

      {Object.keys(results).length === 0 ? (
        <Empty>
          <Mono>Run the scenarios above to see EXECUTE, RECONFIRM and BLOCK from one mandate.</Mono>
        </Empty>
      ) : null}
    </div>
  );
}
