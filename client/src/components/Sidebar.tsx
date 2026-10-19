import { CalendarDays, ClipboardList, Home, PanelLeftClose, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { OPEN_SEARCH_EVENT, expandedStore } from "../lib/uiState";
import { useTree, useTreeActions } from "../hooks/useTree";
import ThemeToggle from "./ThemeToggle";
import { TreeItem } from "./TreeItem";
import { LEVELS, PALETTE, buildRows, countDescendants, type Row, type TreeCtx } from "./treeModel";
import ImportMarkdownModal from "./ImportMarkdownModal";

export default function Sidebar({ onClose }: { onClose: () => void }) {
  const { data, isLoading, error } = useTree();
  const [message, setMessage] = useState<string | null>(null);
  const actions = useTreeActions(setMessage);
  const expanded = expandedStore.use();
  const setExpanded = expandedStore.set;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const rows = useMemo(() => (data ? buildRows(data) : []), [data]);
  const [importTarget, setImportTarget] = useState<Row | null>(null);

  const toggle = (id: string, force?: boolean) =>
    setExpanded((p) => ({ ...p, [id]: force ?? !p[id] }));

  // Crée un élément avec un nom par défaut, puis passe directement en renommage.
  const create = async (level: Row["level"], body: Record<string, unknown>, parentId?: string) => {
    setMessage(null);
    try {
      const created = await actions.create.mutateAsync({ level, body });
      if (parentId) toggle(parentId, true);
      setEditingId(created.id);
    } catch { /* message déjà affiché par onError */ }
  };

  const ctx: TreeCtx = {
    expanded, toggle, editingId, setEditingId, menuId, setMenuId,
    addChild: (row) => {
      const cfg = LEVELS[row.level];
      if (!cfg.child || !cfg.childParentKey) return;
      const child = LEVELS[cfg.child];
      const body: Record<string, unknown> = { [cfg.childParentKey]: row.id, [child.field]: child.newName };
      if (cfg.child === "subjects") body.color = PALETTE[row.children.length % PALETTE.length];
      void create(cfg.child, body, row.id);
    },
    rename: (row, name) => {
      setEditingId(null);
      actions.update.mutate({ level: row.level, id: row.id, body: { [LEVELS[row.level].field]: name } });
    },
    recolor: (row, color) => actions.update.mutate({ level: row.level, id: row.id, body: { color } }),
    remove: (row) => {
      const n = countDescendants(row);
      const extra = n > 0 ? ` Les ${n} éléments qu'il contient seront aussi supprimés.` : "";
      if (!window.confirm(`Supprimer « ${row.name} » ?${extra}`)) return;
      actions.remove.mutate({ level: row.level, id: row.id }, {
        onSuccess: () => { if (location.pathname.includes(row.id)) navigate("/"); },
      });
    },
    move: (siblings, index, dir) => {
      const j = index + dir;
      const first = siblings[0];
      if (!first || j < 0 || j >= siblings.length) return;
      const ids = siblings.map((s) => s.id);
      [ids[index], ids[j]] = [ids[j]!, ids[index]!];
      actions.reorder.mutate({ level: first.level, ids });
    },
    importInto: setImportTarget,
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="Logo Studier" className="h-5 w-5" />
          <span className="text-sm font-semibold tracking-tight">Studier</span>
        </div>

        <div className="flex items-center gap-0.5 text-zinc-500">          <ThemeToggle />
          <button
            className="rounded p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            title="Nouvelle année" aria-label="Nouvelle année"
            onClick={() => void create("years", { label: LEVELS.years.newName })}
          ><Plus size={16} /></button>
          <button className="rounded p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700" onClick={onClose} aria-label="Fermer la barre latérale">
            <PanelLeftClose size={16} />
          </button>
        </div>
      </div>

      <button
        onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
        className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-400 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900"
      >
        <Search size={14} /> Rechercher…
        <kbd className="ml-auto rounded [@media(hover:none)]:hidden border border-zinc-200 px-1.5 text-[10px] dark:border-zinc-700">
          {/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"} K
        </kbd>
      </button>

      <div className="space-y-0.5 px-2 pb-2">
        {[
          { to: "/", label: "Tableau de bord", icon: Home, end: true },
          { to: "/evaluations", label: "Évaluations", icon: ClipboardList, end: false },
          { to: "/emploi-du-temps", label: "Emploi du temps", icon: CalendarDays, end: false },
        ].map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to} to={to} end={end}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800/60 ${isActive ? "font-medium text-indigo-600 dark:text-indigo-400" : "text-zinc-600 dark:text-zinc-300"}`}
          >
            <Icon size={15} /> {label}
          </NavLink>
        ))}
        <div className="mx-1 mt-2 border-t border-zinc-200 dark:border-zinc-800" />
      </div>

      {message && (
        <p className="mx-3 mb-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300" onClick={() => setMessage(null)}>
          {message}
        </p>
      )}

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {isLoading && <p className="px-2 text-sm text-zinc-400">Chargement…</p>}
        {error && <p className="px-2 text-sm text-red-600">{error.message}</p>}
        {data && rows.length === 0 && (
          <p className="px-2 text-sm text-zinc-400">Aucune année. Créez-en une avec le bouton +.</p>
        )}
        <ul>
          {rows.map((r, i) => <TreeItem key={r.id} row={r} siblings={rows} index={i} depth={0} ctx={ctx} />)}
        </ul>
      </nav>
      {importTarget && (
        <ImportMarkdownModal
          subject={importTarget}
          onClose={() => setImportTarget(null)}
          onImported={(ids) => {
            toggle(importTarget.id, true);
            if (ids.length === 1) navigate(`/chapitres/${ids[0]}`);
          }}
        />
      )}
    </div>
  );
}
