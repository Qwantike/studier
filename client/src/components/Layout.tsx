import { Menu, PanelLeftOpen, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { OPEN_SEARCH_EVENT, OPEN_SIDEBAR_EVENT, sidebarStore } from "../lib/uiState";
import CommandPalette from "./CommandPalette";
import ErrorBoundary from "./ErrorBoundary";
import Sidebar from "./Sidebar";
import ThemeToggle from "./ThemeToggle";

// Écran large : barre latérale fixe (rétractable). Écran étroit : tiroir ouvert depuis la barre du haut.
export default function Layout() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const desktopOpen = sidebarStore.use();
  const [drawer, setDrawer] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setDrawer(false), [pathname]); // naviguer referme le tiroir
  useEffect(() => { if (isDesktop) setDrawer(false); }, [isDesktop]);
  useEffect(() => {
    const open = () => setDrawer(true);
    window.addEventListener(OPEN_SIDEBAR_EVENT, open);
    return () => window.removeEventListener(OPEN_SIDEBAR_EVENT, open);
  }, []);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const iconBtn = "rounded p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800";

  return (
    <div className="flex h-dvh">
      {isDesktop && desktopOpen && (
        <aside className="w-72 shrink-0 border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
          <Sidebar onClose={() => sidebarStore.set(false)} />
        </aside>
      )}
      {!isDesktop && drawer && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="fixed inset-y-0 left-0 z-40 w-80 max-w-[85vw] animate-slide-in border-r border-zinc-200 bg-zinc-50 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <Sidebar onClose={() => setDrawer(false)} />
          </aside>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {!isDesktop && (
          <header className="flex shrink-0 items-center gap-1 border-b border-zinc-200 px-2 py-1.5 dark:border-zinc-800">
            <button className={iconBtn} onClick={() => setDrawer(true)} aria-label="Ouvrir le menu"><Menu size={18} /></button>
            <span className="flex-1 text-sm font-semibold tracking-tight">Études</span>
            <button className={iconBtn} onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))} aria-label="Rechercher"><Search size={18} /></button>
            <ThemeToggle />
          </header>
        )}
        <div className="relative min-w-0 flex-1 overflow-y-auto">
          {isDesktop && !desktopOpen && (
            <button className={`absolute left-3 top-3 ${iconBtn}`} onClick={() => sidebarStore.set(true)} aria-label="Ouvrir la barre latérale">
              <PanelLeftOpen size={18} />
            </button>
          )}
          {/* key : une page en erreur ne bloque pas la navigation vers les autres */}
          <ErrorBoundary key={pathname}><Outlet /></ErrorBoundary>
        </div>
      </div>
      <CommandPalette />
    </div>
  );
}
