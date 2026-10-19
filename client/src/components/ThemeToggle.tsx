import { Monitor, Moon, Sun } from "lucide-react";
import { setTheme, themeStore, type Theme } from "../lib/theme";

const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const META = {
  system: { icon: Monitor, label: "système" },
  light: { icon: Sun, label: "clair" },
  dark: { icon: Moon, label: "sombre" },
} as const;

// Bouton à trois états : système (par défaut) → clair → sombre.
export default function ThemeToggle() {
  const theme = themeStore.use();
  const { icon: Icon, label } = META[theme];
  return (
    <button
      onClick={() => setTheme(NEXT[theme])}
      title={`Thème : ${label} (cliquer pour changer)`} aria-label={`Thème : ${label}. Changer de thème`}
      className="rounded p-1.5 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
    ><Icon size={16} /></button>
  );
}
