'use client';

/**
 * Local, non-authoritative settlement records.
 *
 * The contract is the source of truth for decisions. It holds no payment state by design,
 * so the payment leg is remembered in the browser and always re-verified against the
 * settling chain before it is trusted. Losing this store loses a convenience, never a
 * decision: the authorization artifact it references is recomputable from contract state.
 */

import type { Settlement } from '@/lib/types';

const KEY = 'caveat.settlements.v1';

const readAll = (): Record<string, Settlement> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, Settlement>) : {};
  } catch {
    return {};
  }
};

export const getSettlement = (proposalId: string): Settlement | null =>
  readAll()[proposalId] ?? null;

export const putSettlement = (record: Settlement): void => {
  if (typeof window === 'undefined') return;
  try {
    const all = readAll();
    all[record.proposalId] = record;
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // A blocked or full store must not break the page.
  }
};

const AUTH_KEY = 'caveat.authorizations.v1';

/** The digest returned by consume_approval, kept so the payment can reference it. */
export const putAuthorization = (proposalId: string, digest: string): void => {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(AUTH_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    all[proposalId] = digest;
    window.localStorage.setItem(AUTH_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
};

export const getAuthorization = (proposalId: string): string => {
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.localStorage.getItem(AUTH_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return all[proposalId] ?? '';
  } catch {
    return '';
  }
};
