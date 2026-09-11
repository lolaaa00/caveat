import type { EvidenceRecord } from '@/lib/types';
import { Empty } from '@/components/ui/primitives';

const STATUS_CLASS = {
  LIVE: 'es-live',
  FALLBACK: 'es-fallback',
  UNAVAILABLE: 'es-unavailable',
} as const;

const NOTE = {
  LIVE: 'Retrieved by GenLayer validators from the approved source at decision time.',
  FALLBACK:
    'Principal-pinned fallback. Not independently current, so it can never authorize execution.',
  UNAVAILABLE: 'The approved source did not state this fact. The checkpoint fails closed.',
};

export const EvidencePanel = ({
  evidence,
  digest,
}: {
  evidence: EvidenceRecord[];
  digest: string;
}) => {
  if (evidence.length === 0) {
    return (
      <Empty>
        No evidence was retrieved. Deterministic checks decided this proposal before any source
        was queried.
      </Empty>
    );
  }

  return (
    <div>
      {evidence.map((item, i) => (
        <div key={item.qid} style={{ marginBottom: i === evidence.length - 1 ? 0 : '1rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '0.5rem' }}>
            {item.question}
          </div>
          <div className="evi-source">
            <div>
              <div className="evi-src-name">{item.claim}</div>
              <div className="evi-src-time">{item.source_url}</div>
            </div>
            <span className={`evi-status ${STATUS_CLASS[item.retrieval_class]}`}>
              <span className="scan-dot" />
              {item.retrieval_class}
            </span>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--color-faint)', marginTop: '0.5rem', lineHeight: 1.5 }}>
            {NOTE[item.retrieval_class]}
          </p>
        </div>
      ))}
      {digest ? (
        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(234,243,255,.08)' }}>
          <div className="field-k" style={{ marginBottom: '0.35rem' }}>
            Evidence digest
          </div>
          <p className="hash">{digest}</p>
        </div>
      ) : null}
    </div>
  );
};
