import { useSyncExternalStore } from "react";

// Les stores « scoped » stockent leurs valeurs par utilisateur (clé « nom:id ») : l'arbre déplié d'un compte
// ne fuit pas vers un autre sur le même navigateur. Tant qu'aucun utilisateur n'est connecté, ils valent `initial`.
let scope = "";
const reloaders = new Set<() => void>();

/**
 * Change l'utilisateur courant (appelé par AuthProvider avant le rendu des écrans connectés).
 * Recharge les valeurs sans notifier : aucun composant qui les lit n'est monté à ce moment.
 */
export function setStorageScope(next: string): void {
  if (next === scope) return;
  scope = next;
  reloaders.forEach((reload) => reload());
}

/**
 * Petit store global persisté dans localStorage : plusieurs composants (barre latérale, palette de
 * recherche…) partagent le même état d'interface sans passer par des props.
 * `scoped: true` : valeur propre à l'utilisateur connecté (par défaut : propre à l'appareil, ex. le thème).
 */
export function createPersistedStore<T>(key: string, initial: T, opts: { scoped?: boolean } = {}) {
  const scoped = opts.scoped ?? false;
  const storageKey = () => (scoped ? `${key}:${scope}` : key);
  const enabled = () => !scoped || scope !== "";

  const read = (): T => {
    if (!enabled()) return initial;
    try {
      const raw = localStorage.getItem(storageKey());
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch { return initial; }
  };
  let value = read();
  const listeners = new Set<() => void>();
  if (scoped) reloaders.add(() => { value = read(); });

  const set = (next: T | ((prev: T) => T)) => {
    value = typeof next === "function" ? (next as (prev: T) => T)(value) : next;
    if (enabled()) { try { localStorage.setItem(storageKey(), JSON.stringify(value)); } catch { /* stockage indisponible */ } }
    listeners.forEach((l) => l());
  };
  const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

  return { use: () => useSyncExternalStore(subscribe, () => value), set, get: () => value };
}