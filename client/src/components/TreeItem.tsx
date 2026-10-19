import { ArrowDown, ArrowUp, ChevronRight, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { STATUS_DOT, STATUS_LABELS } from "../api/types";
import { LEVELS, type Row, type TreeCtx } from "./treeModel";

function InlineEdit({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(value);
  const done = useRef(false); // évite le double déclenchement Entrée + blur
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const t = text.trim();
    if (save && t && t !== value) onSave(t); else onCancel();
  };
  return (
    <input
      autoFocus
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      className="min-w-0 flex-1 rounded border border-indigo-400 bg-white px-1.5 py-0.5 text-sm outline-none dark:bg-zinc-900"
    />
  );
}

// Pastille de couleur : ouvre le sélecteur natif ; sauvegarde différée pour éviter une requête par mouvement.
function ColorDot({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [v, setV] = useState(color);
  useEffect(() => setV(color), [color]);
  useEffect(() => {
    if (v === color) return;
    const t = setTimeout(() => onChange(v), 500);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="relative flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center" title="Changer la couleur">
      <span className="block h-2.5 w-2.5 rounded-full" style={{ background: v }} />
      <input type="color" value={v} onChange={(e) => setV(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
    </label>
  );
}

interface Props { row: Row; siblings: Row[]; index: number; depth: number; ctx: TreeCtx }

export function TreeItem({ row, siblings, index, depth, ctx }: Props) {
  const cfg = LEVELS[row.level];
  const open = !!ctx.expanded[row.id];
  const editing = ctx.editingId === row.id;
  const menuOpen = ctx.menuId === row.id;
  const menuItem = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-zinc-800";
  const iconBtn = "rounded p-1.5 md:p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-zinc-100";

  const label = editing ? (
    <InlineEdit value={row.name} onSave={(v) => ctx.rename(row, v)} onCancel={() => ctx.setEditingId(null)} />
  ) : row.level === "chapters" ? (
    <NavLink
      to={`/chapitres/${row.id}`}
      className={({ isActive }) =>
        `min-w-0 flex-1 truncate ${isActive ? "font-medium text-indigo-600 dark:text-indigo-400" : ""}`}
    >
      {row.name}
    </NavLink>
  ) : (
    <button onClick={() => ctx.toggle(row.id)} className="min-w-0 flex-1 truncate text-left font-medium">
      {row.name}
    </button>
  );

  return (
    <li>
      <div
        data-node-id={row.id}
        className="group relative flex items-center gap-1 rounded-md py-1 pr-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
        style={{ paddingLeft: depth * 14 + 4 }}
      >
        {cfg.child ? (
          <button onClick={() => ctx.toggle(row.id)} aria-label={open ? "Replier" : "Déplier"} className="shrink-0 text-zinc-400">
            <ChevronRight size={14} className={`transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
        ) : <span className="w-3.5 shrink-0" />}

        {row.level === "subjects" && row.color && <ColorDot color={row.color} onChange={(c) => ctx.recolor(row, c)} />}
        {row.level === "chapters" && row.status && (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center" title={STATUS_LABELS[row.status]}>
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[row.status]}`} />
          </span>
        )}

        {label}

        {!editing && (
          <div className={`flex shrink-0 items-center ${menuOpen ? "" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"}`}>
            {cfg.child && (
              <button className={iconBtn} onClick={() => ctx.addChild(row)} aria-label="Ajouter" title="Ajouter">
                <Plus size={14} />
              </button>
            )}
            <button className={iconBtn} onClick={() => ctx.setMenuId(menuOpen ? null : row.id)} aria-label="Options">
              <MoreHorizontal size={14} />
            </button>
          </div>
        )}

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => ctx.setMenuId(null)} />
            <div className="absolute right-1 top-full z-30 mt-1 w-40 rounded-lg border border-zinc-200 bg-white p-1 shadow-md dark:border-zinc-700 dark:bg-zinc-900">
              <button className={menuItem} onClick={() => { ctx.setMenuId(null); ctx.setEditingId(row.id); }}>
                <Pencil size={14} /> Renommer
              </button>
              <button className={menuItem} disabled={index === 0} onClick={() => { ctx.setMenuId(null); ctx.move(siblings, index, -1); }}>
                <ArrowUp size={14} /> Monter
              </button>
              <button className={menuItem} disabled={index === siblings.length - 1} onClick={() => { ctx.setMenuId(null); ctx.move(siblings, index, 1); }}>
                <ArrowDown size={14} /> Descendre
              </button>
              <button className={`${menuItem} text-red-600`} onClick={() => { ctx.setMenuId(null); ctx.remove(row); }}>
                <Trash2 size={14} /> Supprimer
              </button>
            </div>
          </>
        )}
      </div>

      {open && cfg.child && (
        row.children.length > 0 ? (
          <ul>
            {row.children.map((c, i) => (
              <TreeItem key={c.id} row={c} siblings={row.children} index={i} depth={depth + 1} ctx={ctx} />
            ))}
          </ul>
        ) : (
          <p className="py-1 text-xs text-zinc-400" style={{ paddingLeft: (depth + 1) * 14 + 22 }}>Vide</p>
        )
      )}
    </li>
  );
}
