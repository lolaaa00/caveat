import type { EvidenceRecord } from '@/lib/types';
import { Badge, Empty } from '@/components/ui/primitives';

const TONE = {
  LIVE: 'execute',
  FALLBACK: 'reconfirm',
  UNAVAILABLE: 'block',
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
    <div className="space-y-4">
      {evidence.map((item) => (
        <div key={item.qid} className="border border-line bg-surface p-3.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-xl text-[12px] text-ink-dim">{item.question}</p>
            <Badge tone={TONE[item.retrieval_class]}>{item.retrieval_class}</Badge>
          </div>
          <p className="datum mt-3 text-[24px] leading-none text-ink">{item.claim}</p>
          <p className="mt-3 text-[11px] text-ink-faint">{NOTE[item.retrieval_class]}</p>
          <a
            href={item.source_url}
            target="_blank"
            rel="noreferrer"
            className="datum mt-2 inline-block text-[11px] break-all text-signal hover:underline"
          >
            {item.source_url}
          </a>
        </div>
      ))}
      {digest ? (
        <div>
          <div className="label mb-1">Evidence digest</div>
          <p className="datum text-[11px] break-all text-ink-faint">{digest}</p>
        </div>
      ) : null}
    </div>
  );
};
