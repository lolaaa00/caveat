import type { Mandate, Proposal } from '@/lib/types';

/**
 * The core comparison the whole product exists to make visible: what was authorized,
 * against what is proposed right now. Current context lives in its own evidence panel
 * further down the page, exactly as the checkpoint's narrative unfolds.
 */
export const ComparisonGrid = ({ mandate, proposal }: { mandate: Mandate; proposal: Proposal }) => {
  const payload = proposal.action_payload as Record<string, unknown>;

  return (
    <div className="checkpoint-grid grid-2">
      <div className="panel">
        <div className="panel-head">Mandate</div>
        <div className="mandate-quote">&#8220;{mandate.intent_text}&#8221;</div>
        <div className="field-grid">
          <div>
            <div className="field-k">Agent</div>
            <div className="field-v pos">AUTHORIZED</div>
          </div>
          <div>
            <div className="field-k">Status</div>
            <div className={`field-v ${mandate.status === 'ACTIVE' ? 'pos' : ''}`}>{mandate.status}</div>
          </div>
          {mandate.purpose_text ? (
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="field-k">Purpose</div>
              <div className="field-v" style={{ fontWeight: 400 }}>
                {mandate.purpose_text}
              </div>
            </div>
          ) : null}
          {mandate.semantic_conditions ? (
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="field-k">Semantic condition</div>
              <div className="field-v" style={{ fontWeight: 400 }}>
                {mandate.semantic_conditions}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">Proposed Action</div>
        <div className="kv-item">
          <span className="kv-k">Summary</span>
          <span className="kv-v">{proposal.action_summary || '-'}</span>
        </div>
        {Object.entries(payload).map(([key, value]) => (
          <div key={key} className="kv-item">
            <span className="kv-k">{key.replace(/_/g, ' ')}</span>
            <span className="kv-v">
              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
