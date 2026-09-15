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

/**
 * A settlement record. This is NOT contract state: GenLayer decides, it does not settle.
 * The record lives client-side and is verified against the settling chain's own RPC.
 */
export interface Settlement {
  proposalId: string;
  chain: string;
  txHash: string;
  payee: string;
  amountMinor: string;
  /** The authorization artifact returned by consume_approval that permitted this payment. */
  authorization: string;
  /** The transfer itself was found, succeeded on chain, and met the stated payee/amount. */
  paymentConfirmed: boolean;
  /**
   * True only when the payment is cryptographically bound to this proposal's canonical
   * authorization artifact and sent by a wallet the mandate authorizes. A rail that
   * cannot carry the artifact (e.g. Solana here) can never set this true, no matter how
   * the payment itself looks — it is reported as an unverified external payment instead.
   */
  authorizedExecution: boolean;
  detail: string;
  chainRef: string;
  recordedAt: number;
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
  executable: boolean;
}

/**
 * Every on-chain operation reports one of these. Nothing is ever silently assumed.
 *
 * These are the real boundaries `send()` (lib/genlayer/caveat.ts) actually crosses, not
 * invented timers: fee estimation, then the wallet call that both signs and submits (the
 * SDK does not expose a separate mid-point between "asked to sign" and "broadcast", so
 * both are marked at that one call's start/end), then polling for a consensus decision.
 * There is no 'finalized' phase — this app deliberately waits only for 'decided' (see
 * BUILD_DECISIONS.md: finalization lags too long for interactive use), so a state that
 * claimed to wait for finalization would be lying about what actually happened.
 */
export type TxPhase =
  | 'idle'
  | 'estimating'
  | 'awaiting-approval'
  | 'submitted'
  | 'pending-consensus'
  | 'decided'
  | 'error';

/** Phases where a write is genuinely in flight — use this, not a literal phase check,
 * to disable buttons/inputs, since which phases count as "busy" may still grow. */
const BUSY_PHASES: ReadonlySet<TxPhase> = new Set([
  'estimating',
  'awaiting-approval',
  'submitted',
  'pending-consensus',
]);
export const isBusy = (phase: TxPhase): boolean => BUSY_PHASES.has(phase);

/** Where a failed write actually broke, so the UI can say why instead of just "failed". */
export type TxFailureStage =
  | 'estimating'
  | 'signing'
  | 'submitting'
  | 'consensus'
  | 'execution'
  | 'timeout'
  | 'unknown';

export interface TxState {
  phase: TxPhase;
  hash?: string;
  label?: string;
  error?: string;
  failureStage?: TxFailureStage;
}
