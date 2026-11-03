import { PanelLeftOpen } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { sidebarStore } from '../lib/uiState'
import CommandPalette from './CommandPalette'
import ErrorBoundary from './ErrorBoundary'
import Sidebar from './Sidebar'
import MobileNavigation from './MobileNavigation'

// Écran large : barre latérale fixe (rétractable). Écran étroit : tiroir ouvert depuis la barre du haut.
export default function Layout() {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const desktopOpen = sidebarStore.use()
  const { pathname } = useLocation()

  const iconBtn =
    'rounded p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'

  return (
    <div className="flex h-dvh">
      {isDesktop && desktopOpen && (
        <aside className="w-72 shrink-0 border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
          <Sidebar onClose={() => sidebarStore.set(false)} />
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {!isDesktop && <MobileNavigation key={pathname} />}
        <div className="relative min-w-0 flex-1 overflow-y-auto">
          {isDesktop && !desktopOpen && (
            <button
              className={`absolute left-3 top-3 ${iconBtn}`}
              onClick={() => sidebarStore.set(true)}
              aria-label="Ouvrir la barre latérale"
            >
              <PanelLeftOpen size={18} />
            </button>
          )}
          {/* key : une page en erreur ne bloque pas la navigation vers les autres */}
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </div>
      <CommandPalette />
    </div>
  )
}
