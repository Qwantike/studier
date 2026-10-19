import { useSyncExternalStore } from "react";

/**
 * Petit store global persisté dans localStorage : plusieurs composants (barre latérale, palette de
 * recherche…) partagent le même état d'interface sans passer par des props.
 */
export function createPersistedStore<T>(key: string, initial: T) {
  const read = (): T => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch { return initial; }
  };
  let value = read();
  const listeners = new Set<() => void>();

  const set = (next: T | ((prev: T) => T)) => {
    value = typeof next === "function" ? (next as (prev: T) => T)(value) : next;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
    listeners.forEach((l) => l());
  };
  const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

  return { use: () => useSyncExternalStore(subscribe, () => value), set, get: () => value };
}
