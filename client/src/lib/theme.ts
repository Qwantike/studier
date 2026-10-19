import { createPersistedStore } from "./persistedStore";

export type Theme = "system" | "light" | "dark";
export const themeStore = createPersistedStore<Theme>("etudes.theme", "system");

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

/** Pose ou retire la classe "dark" sur <html> (Tailwind darkMode: "class"). */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && prefersDark.matches));
}

export function setTheme(theme: Theme): void {
  themeStore.set(theme);
  applyTheme(theme);
}

/** En mode "système", suit les changements du réglage de l'OS en direct. */
export function initTheme(): void {
  applyTheme(themeStore.get());
  prefersDark.addEventListener("change", () => applyTheme(themeStore.get()));
}
