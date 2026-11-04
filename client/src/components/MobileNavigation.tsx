import { Menu, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { OPEN_SEARCH_EVENT, OPEN_SIDEBAR_EVENT } from '../lib/uiState'
import Sidebar from './Sidebar'
import ThemeToggle from './ThemeToggle'

// Remonté à chaque navigation et démonté sur écran large : le tiroir repart fermé.
export default function MobileNavigation() {
  const [drawer, setDrawer] = useState(false)
  useEffect(() => {
    const open = () => setDrawer(true)
    window.addEventListener(OPEN_SIDEBAR_EVENT, open)
    return () => window.removeEventListener(OPEN_SIDEBAR_EVENT, open)
  }, [])
  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer])
  const iconBtn =
    'rounded p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
  return (
    <>
      {drawer && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setDrawer(false)}
            aria-hidden
          />
          <aside className="fixed inset-y-0 left-0 z-40 w-80 max-w-[85vw] animate-slide-in border-r border-zinc-200 bg-zinc-50 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <Sidebar onClose={() => setDrawer(false)} />
          </aside>
        </>
      )}
      <header className="flex shrink-0 items-center gap-1 border-b border-zinc-200 px-2 py-1.5 dark:border-zinc-800">
        <button
          className={iconBtn}
          onClick={() => setDrawer(true)}
          aria-label="Ouvrir le menu"
        >
          <Menu size={18} />
        </button>
        <span className="flex-1 text-sm font-semibold tracking-tight">
          Études
        </span>
        <button
          className={iconBtn}
          onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
          aria-label="Rechercher"
        >
          <Search size={18} />
        </button>
        <ThemeToggle />
      </header>
    </>
  )
}
