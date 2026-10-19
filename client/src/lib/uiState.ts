import { createPersistedStore } from "./persistedStore";

export const expandedStore = createPersistedStore<Record<string, boolean>>("etudes.expanded", {});
export const sidebarStore = createPersistedStore<boolean>("etudes.sidebar", true);

/** Événement qui ouvre la palette de recherche (bouton de la barre latérale). */
export const OPEN_SEARCH_EVENT = "etudes:open-search";

/** Événement qui ouvre le tiroir de la barre latérale (écrans étroits). */
export const OPEN_SIDEBAR_EVENT = "etudes:open-sidebar";

/** Déplie ces nœuds dans l'arbre, ouvre la barre latérale et fait défiler jusqu'au dernier nœud. */
export function revealInTree(ids: string[]): void {
  expandedStore.set((p) => ({ ...p, ...Object.fromEntries(ids.map((id) => [id, true])) }));
  sidebarStore.set(true);
  window.dispatchEvent(new Event(OPEN_SIDEBAR_EVENT));
  const target = ids[ids.length - 1];
  // On attend le rendu de l'arbre déplié avant de chercher l'élément.
  setTimeout(() => document.querySelector(`[data-node-id="${target}"]`)?.scrollIntoView({ block: "center" }), 80);
}
