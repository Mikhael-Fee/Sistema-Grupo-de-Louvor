import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { useMinistry } from '../context/MinistryContext';

const PREFIX = 'candeia.draft.v1:';
const initial = <T,>(value: T | (() => T)): T => typeof value === 'function' ? (value as () => T)() : value;

function restore<T>(key: string, fallback: T): { value: T; saved: boolean } {
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (stored?.version === 1 && Object.hasOwn(stored, 'value') && typeof stored.value === typeof fallback) {
      if (typeof fallback === 'object' && fallback !== null && Object.entries(fallback).some(([field, value]) => {
        const candidate = stored.value[field];
        return Array.isArray(value) ? !Array.isArray(candidate) : value !== undefined && typeof candidate !== typeof value;
      })) return { value: fallback, saved: false };
      return { value: stored.value as T, saved: true };
    }
  } catch { /* Unavailable or invalid storage leaves the in-memory editor usable. */ }
  return { value: fallback, saved: false };
}

/** Drafts belong to one account and tab; only explicit Save writes to the ministry. */
export function useDraft<T>(key: string, initialValue: T | (() => T)) {
  const { mode, profile } = useMinistry();
  const storageKey = `${PREFIX}${mode}:${profile?.id || 'guest'}:${key}`;
  const factory = useRef(initialValue);
  factory.current = initialValue;
  const [state, setState] = useState(() => ({ key: storageKey, ...restore(storageKey, initial(initialValue)) }));
  const current = useRef(state.value);
  current.current = state.value;
  useEffect(() => {
    if (state.key === storageKey) return;
    const next = restore(storageKey, initial(factory.current));
    current.current = next.value;
    setState({ key: storageKey, ...next });
  }, [storageKey, state.key]);
  const setDraft = useCallback((update: SetStateAction<T>) => {
    const next = typeof update === 'function' ? (update as (value: T) => T)(current.current) : update;
    current.current = next;
    let saved = false;
    try { sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, value: next })); saved = true; }
    catch { /* Keep the editor usable if this browser denies tab storage. */ }
    setState({ key: storageKey, value: next, saved });
  }, [storageKey]);
  const discardDraft = useCallback(() => {
    try { sessionStorage.removeItem(storageKey); } catch { /* Storage can be unavailable. */ }
    setState(currentState => ({ ...currentState, saved: false }));
  }, [storageKey]);
  return { draft: state.value, setDraft, discardDraft, hasDraft: state.saved };
}

export function clearAccountDrafts(mode: string, accountId: string) {
  try {
    const prefix = `${PREFIX}${mode}:${accountId}:`;
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(prefix)) sessionStorage.removeItem(key);
  } catch { /* Signing out does not depend on draft storage. */ }
}
