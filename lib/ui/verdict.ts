import type { Proposal, Verdict } from '@/lib/types';

/**
 * Verdict presentation. The palette is the only thing decided here — the verdict itself
 * always comes from the contract.
 *
 * EXECUTE reads as authorization, RECONFIRM as a pause, BLOCK as a rejection.
 */
export interface VerdictSkin {
  color: string;
  bg: string;
  glow: string;
  tone: 'lime' | 'amber' | 'crimson' | 'neutral';
  gate: string;
  gateSub: string;
  divider: string;
  note: string;
}

const SKINS: Record<'EXECUTE' | 'RECONFIRM' | 'BLOCK' | 'PENDING', VerdictSkin> = {
  EXECUTE: {
    color: '#c7ff32',
    bg: 'rgba(199,255,50,.12)',
    glow: 'rgba(199,255,50,.25)',
    tone: 'lime',
    gate: 'EXECUTION AUTHORIZED',
    gateSub: 'One-time approval: ready to consume',
    divider: 'CONTEXT CONFIRMS ORIGINAL INTENT.',
    note: 'Every purpose-critical condition in the mandate still holds. A single-use execution approval is open.',
  },
  RECONFIRM: {
    color: '#ffb547',
    bg: 'rgba(255,181,71,.12)',
    glow: 'rgba(255,181,71,.25)',
    tone: 'amber',
    gate: 'EXECUTION LOCKED',
    gateSub: 'Awaiting principal reconfirmation',
    divider: 'BUT THE WORLD CHANGED.',
    note: 'Original authority is insufficient under current context. CAVEAT does not extrapolate new permission. It stops.',
  },
  BLOCK: {
    color: '#ff1558',
    bg: 'rgba(255,21,88,.14)',
    glow: 'rgba(255,21,88,.25)',
    tone: 'crimson',
    gate: 'EXECUTION REFUSED',
    gateSub: 'Contradicts the mandate: cannot be reconfirmed',
    divider: 'THE MANDATE FORBIDS THIS.',
    note: 'This action contradicts the mandate. No context or consensus step can override a hard constraint.',
  },
  PENDING: {
    color: '#84909f',
    bg: 'rgba(234,243,255,.06)',
    glow: 'rgba(234,243,255,.1)',
    tone: 'neutral',
    gate: 'AWAITING CHECKPOINT',
    gateSub: 'No verdict exists until the contract produces one',
    divider: 'NOT YET EVALUATED.',
    note: 'This proposal has not passed the checkpoint. Nothing is decided, and nothing is displayed as decided.',
  },
};

export const skinFor = (verdict: Verdict | string): VerdictSkin =>
  SKINS[(verdict || 'PENDING') as keyof typeof SKINS] ?? SKINS.PENDING;

/** CSS variables the verdict-aware components read. */
export const skinVars = (skin: VerdictSkin) =>
  ({
    '--chip-color': skin.color,
    '--chip-bg': skin.bg,
    '--chip-glow': skin.glow,
  }) as React.CSSProperties;

/** A blocked proposal decided by fixed rules never reached a model. */
export const decidedDeterministically = (proposal: Proposal) =>
  proposal.reason_code === 'DETERMINISTIC_CONSTRAINT_FAILED';
