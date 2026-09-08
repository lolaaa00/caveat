/** Shapes returned by the contract's view methods. The contract is authoritative. */

export type MandateStatus = 'DRAFT' | 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export type ProposalStatus =
  | 'PROPOSED'
  | 'CHECKING'
  | 'EXECUTE_APPROVED'
  | 'RECONFIRM_REQUIRED'
  | 'BLOCKED'
  | 'INCONCLUSIVE';

export type Verdict = 'EXECUTE' | 'RECONFIRM' | 'BLOCK' | '';

export type ConstraintOp =
  | 'lte' | 'lt' | 'gte' | 'gt' | 'eq' | 'neq' | 'in' | 'not_in' | 'is_true' | 'is_false';

export interface HardConstraint {
  label: string;
  field: string;
  op: ConstraintOp;
  value?: unknown;
}

export interface EvidenceQuestion {
  qid: string;
  question: string;
  source_url: string;
  answer_schema?: string;
  fallback_claim?: string;
}

export interface Mandate {
  mandate_id: string;
  principal: string;
  agent: string;
  intent_text: string;
  purpose_text: string;
  action_type: string;
  hard_constraints: HardConstraint[];
  semantic_conditions: string;
  approved_sources: string[];
  evidence_questions: EvidenceQuestion[];
  reconfirm_policy: string;
  created_at: number;
  expires_at: number;
  status: MandateStatus;
  commitment: string;
  reconfirm_count: number;
}

export interface CheckOutcome {
  label: string;
  field: string;
  op: string;
  expected: string;
  actual: string;
  passed: boolean;
  detail: string;
}

export type RetrievalClass = 'LIVE' | 'FALLBACK' | 'UNAVAILABLE';

export interface EvidenceRecord {
  qid: string;
  question: string;
  source_url: string;
  claim: string;
  retrieval_class: RetrievalClass;
  retrieved_at: string;
}

export interface Settlement {
  chain: string;
  tx_hash: string;
  payee: string;
  amount_minor: string;
  verified: boolean;
  detail: string;
  chain_ref: string;
  recorded_at: number;
}

export interface Proposal {
  proposal_id: string;
  mandate_id: string;
  agent: string;
  action_type: string;
  action_payload: Record<string, unknown>;
  action_summary: string;
  status: ProposalStatus;
  deterministic_checks: CheckOutcome[];
  evidence: EvidenceRecord[];
  evidence_digest: string;
  verdict: Verdict;
  reason_code: string;
  material_changed_fact: string;
  confidence: string;
  short_rationale: string;
  mandate_commitment: string;
  created_at: number;
  decided_at: number;
  reconfirmed_at: number;
  approval_consumed: boolean;
  consumed_at: number;
  settlement: Settlement | null;
  executable: boolean;
}

/** Every on-chain operation reports one of these. Nothing is ever silently assumed. */
export type TxPhase = 'idle' | 'pending' | 'success' | 'error';

export interface TxState {
  phase: TxPhase;
  hash?: string;
  label?: string;
  error?: string;
}
