import { Command } from "cmdk";
import { BookOpen, CalendarDays, ClipboardList, FileText, Home } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { STATUS_DOT, type ChapterStatus } from "../api/types";
import { useTree } from "../hooks/useTree";
import { OPEN_SEARCH_EVENT, revealInTree } from "../lib/uiState";

interface Item { id: string; title: string; path: string; reveal: string[]; color?: string; status?: ChapterStatus }

// Insensible à la casse et aux accents : "modele" trouve "Modèle relationnel".
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// Score cmdk : titre commençant par la saisie > titre contenant > tous les mots présents (titre ou chemin).
// La valeur de chaque item est son identifiant ; le texte cherché est passé en `keywords` [titre, chemin].
const filter = (_value: string, search: string, keywords?: string[]): number => {
  const q = norm(search).trim();
  if (!q) return 1;
  const title = norm(keywords?.[0] ?? "");
  const path = norm(keywords?.[1] ?? "");
  if (title.startsWith(q)) return 1;
  if (title.includes(q)) return 0.8;
  return q.split(/\s+/).every((w) => title.includes(w) || path.includes(w)) ? 0.5 : 0;
};

const PAGES = [
  { id: "page-home", title: "Tableau de bord", to: "/", icon: Home },
  { id: "page-evals", title: "Évaluations", to: "/evaluations", icon: ClipboardList },
  { id: "page-calendar", title: "Emploi du temps", to: "/emploi-du-temps", icon: CalendarDays },
];

const itemCls = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-zinc-100 dark:data-[selected=true]:bg-zinc-800";
const groupCls = "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-zinc-400";

// Recherche rapide Ctrl/Cmd+K sur les matières et les chapitres (l'arbre est déjà en mémoire : instantané).
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: tree } = useTree();
  const navigate = useNavigate();

  const close = () => { setOpen(false); setSearch(""); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); // évite la barre de recherche du navigateur
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(OPEN_SEARCH_EVENT, onOpen); };
  }, []);

  const { subjects, chapters } = useMemo(() => {
    const subjects: Item[] = [];
    const chapters: Item[] = [];
    for (const y of tree ?? []) for (const s of y.semesters) for (const su of s.subjects) {
      const reveal = [y.id, s.id, su.id];
      subjects.push({ id: su.id, title: su.name, path: `${y.label} · ${s.label}`, reveal, color: su.color });
      for (const c of su.chapters) {
        chapters.push({ id: c.id, title: c.title, path: `${su.name} · ${y.label} · ${s.label}`, reveal, status: c.status });
      }
    }
    return { subjects, chapters };
  }, [tree]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[15vh]" onMouseDown={close}>
      <Command
        label="Recherche rapide" filter={filter} loop
        onKeyDown={(e) => { if (e.key === "Escape") close(); }}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
      >
        <Command.Input
          autoFocus value={search} onValueChange={setSearch}
          placeholder="Rechercher une matière ou un chapitre…"
          className="w-full border-b border-zinc-100 bg-transparent px-4 py-3.5 text-sm outline-none placeholder:text-zinc-400 dark:border-zinc-800"
        />
        <Command.List className="max-h-[50vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-zinc-400">Aucun résultat.</Command.Empty>

          {subjects.length > 0 && (
            <Command.Group heading="Matières" className={groupCls}>
              {subjects.map((s) => (
                <Command.Item
                  key={s.id} value={s.id} keywords={[s.title, s.path]} className={itemCls}
                  onSelect={() => { close(); revealInTree(s.reveal); }}
                >
                  <BookOpen size={15} style={{ color: s.color }} />
                  <span className="truncate font-medium">{s.title}</span>
                  <span className="ml-auto truncate text-xs text-zinc-400">{s.path}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {chapters.length > 0 && (
            <Command.Group heading="Chapitres" className={groupCls}>
              {chapters.map((c) => (
                <Command.Item
                  key={c.id} value={c.id} keywords={[c.title, c.path]} className={itemCls}
                  onSelect={() => { close(); revealInTree(c.reveal); navigate(`/chapitres/${c.id}`); }}
                >
                  <FileText size={15} className="shrink-0 text-zinc-400" />
                  <span className="truncate">{c.title}</span>
                  {c.status && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[c.status]}`} />}
                  <span className="ml-auto truncate pl-3 text-xs text-zinc-400">{c.path}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Group heading="Pages" className={groupCls}>
            {PAGES.map(({ id, title, to, icon: Icon }) => (
              <Command.Item key={id} value={id} keywords={[title, ""]} className={itemCls} onSelect={() => { close(); navigate(to); }}>
                <Icon size={15} className="text-zinc-400" /> {title}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
