import type { EvidenceRecord } from '@/lib/types';

const STATUS_CLASS = {
  LIVE: 'es-live',
  FALLBACK: 'es-fallback',
  UNAVAILABLE: 'es-unavailable',
} as const;

const STATUS_LABEL = {
  LIVE: 'VERIFIED',
  FALLBACK: 'FALLBACK',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

/**
 * "But the world changed" — the current-context beat, in the demo's big-number register.
 * Every value here is exactly what the contract retrieved; nothing is computed by the page.
 */
export const ContextPanel = ({
  evidence,
  materialChangedFact,
}: {
  evidence: EvidenceRecord[];
  materialChangedFact: string;
}) => {
  if (evidence.length === 0) {
    return (
      <div className="panel">
        <div className="panel-head">Current Context</div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-faint)' }}>
          Not evaluated. Deterministic checks decided this proposal before any source was
          queried.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">Current Context</div>
      <div className="context-compare">
        {evidence.map((item) => (
          <div className="ctx-block" key={item.qid}>
            <div className="ctx-k">{item.question}</div>
            <div className="ctx-v">{item.claim}</div>
          </div>
        ))}
      </div>
      {materialChangedFact ? (
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <span className="ctx-diff">{materialChangedFact.toUpperCase()}</span>
        </div>
      ) : null}
      {evidence.map((item) => (
        <div className="evi-source" key={item.qid} style={{ marginBottom: '0.5rem' }}>
          <div>
            <div className="evi-src-name">{item.source_url}</div>
            <div className="evi-src-time">retrieved at decision time</div>
          </div>
          <span className={`evi-status ${STATUS_CLASS[item.retrieval_class]}`}>
            <span className="scan-dot" />
            {STATUS_LABEL[item.retrieval_class]}
          </span>
        </div>
      ))}
    </div>
  );
};
