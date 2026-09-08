import type { EvidenceRecord, Mandate, Proposal } from '@/lib/types';

const Column = ({
  heading,
  caption,
  children,
}: {
  heading: string;
  caption: string;
  children: React.ReactNode;
}) => (
  <div className="flex-1 border border-line bg-panel p-4">
    <div className="label">{heading}</div>
    <p className="mt-1 mb-3 text-[11px] text-ink-faint">{caption}</p>
    <div className="space-y-3">{children}</div>
  </div>
);

const Line = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <div className="label mb-0.5">{label}</div>
    <div className="text-[13px] leading-snug text-ink">{value}</div>
  </div>
);

/**
 * The core comparison the whole product exists to make visible:
 * what was authorized, what is proposed, and what the world now says.
 */
export const ComparisonGrid = ({
  mandate,
  proposal,
  evidence,
}: {
  mandate: Mandate;
  proposal: Proposal;
  evidence: EvidenceRecord[];
}) => {
  const payload = proposal.action_payload as Record<string, unknown>;

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <Column heading="Mandate" caption="What the principal authorized, in their own words">
        <Line label="Original intent" value={mandate.intent_text} />
        <Line label="Purpose" value={mandate.purpose_text || '—'} />
        <Line label="Semantic condition" value={mandate.semantic_conditions || '—'} />
      </Column>

      <Column heading="Proposed action" caption="What the agent wants to do right now">
        <Line label="Summary" value={proposal.action_summary || '—'} />
        <div>
          <div className="label mb-1">Payload</div>
          <dl className="space-y-1">
            {Object.entries(payload).map(([key, value]) => (
              <div key={key} className="flex justify-between gap-3 border-b border-line py-1">
                <dt className="datum text-[11px] text-ink-faint">{key}</dt>
                <dd className="datum text-[11px] text-ink">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Column>

      <Column heading="Current context" caption="What independently retrieved evidence says today">
        {evidence.length === 0 ? (
          <p className="text-[13px] text-ink-faint">
            Not retrieved. Deterministic checks decided this proposal first.
          </p>
        ) : (
          evidence.map((item) => (
            <div key={item.qid}>
              <div className="label mb-0.5">{item.question}</div>
              <div className="datum text-[20px] text-ink">{item.claim}</div>
              <div className="label mt-1">{item.retrieval_class}</div>
            </div>
          ))
        )}
      </Column>
    </div>
  );
};
