import { useQueryClient } from "@tanstack/react-query";
import { FileText, Upload, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { api } from "../api/client";
import { parseNotionMarkdown, type ParsedNotionPage } from "../lib/notionMarkdown";
import Modal from "./Modal";
import type { Row } from "./treeModel";

const MAX_BYTES = 2 * 1024 * 1024;

interface Item { id: string; filename: string; size: number; page: ParsedNotionPage }

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

interface Props {
  /** Matière dans laquelle les chapitres sont créés. */
  subject: Row;
  onClose: () => void;
  /** Appelé après l'import avec les identifiants des chapitres créés. */
  onImported: (chapterIds: string[]) => void;
}

// Import de pages Notion exportées en Markdown : un fichier .md = un nouveau chapitre.
export default function ImportMarkdownModal({ subject, onClose, onImported }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = async (files: File[]) => {
    const rejected: string[] = [];
    const added: Item[] = [];
    for (const file of files) {
      if (!/\.md$/i.test(file.name)) { rejected.push(`« ${file.name} » : seuls les fichiers .md sont acceptés`); continue; }
      if (file.size > MAX_BYTES) { rejected.push(`« ${file.name} » : fichier trop volumineux (2 Mo maximum)`); continue; }
      added.push({
        id: crypto.randomUUID(), filename: file.name, size: file.size,
        page: parseNotionMarkdown(await file.text(), file.name),
      });
    }
    setItems((prev) => [...prev, ...added]);
    setError(rejected.length ? rejected.join(" — ") : null);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void addFiles([...e.dataTransfer.files]);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const created: string[] = [];
    try {
      for (const item of items) { // séquentiel : l'ordre des fichiers = l'ordre des chapitres
        const chapter = await api<{ id: string }>("/chapters", {
          method: "POST",
          body: JSON.stringify({
            subject_id: subject.id,
            title: item.page.title.slice(0, 200),
            content_md: item.page.content,
          }),
        });
        created.push(chapter.id);
      }
    } catch (err) {
      // On garde dans la liste ce qui n'a pas été importé pour pouvoir réessayer.
      setItems((prev) => prev.slice(created.length));
      setError(`${created.length ? `${plural(created.length, "chapitre importé", "chapitres importés")}, puis erreur` : "Erreur"} : ${(err as Error).message}`);
    } finally {
      setBusy(false);
      if (created.length) void qc.invalidateQueries({ queryKey: ["tree"] });
    }
    if (created.length === items.length) { onImported(created); onClose(); }
  };

  // Portail : la modale ne dépend pas du tiroir mobile qui la contient dans l'arbre React.
  return createPortal(
    <Modal title={`Importer dans « ${subject.name} »`} onClose={onClose}>
      <div
        className="space-y-4"
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
        onDrop={onDrop}
      >
        <div className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          over ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40" : "border-zinc-300 dark:border-zinc-700"}`}>
          <Upload size={22} className="text-zinc-400" />
          <p className="text-sm">Glissez-déposez vos fichiers <strong>.md</strong> ici</p>
          <button type="button" onClick={() => inputRef.current?.click()} className="text-sm text-indigo-600 underline dark:text-indigo-400">
            ou parcourir…
          </button>
          <input
            ref={inputRef} type="file" accept=".md,text/markdown" multiple className="hidden"
            onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = ""; }}
          />
        </div>

        <p className="text-xs text-zinc-400">
          Dans Notion : menu ⋯ de la page → Exporter → Markdown. Chaque fichier devient un chapitre ; les images ne sont pas importées.
        </p>

        {items.length > 0 && (
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {items.map((it) => {
              const notes = [
                it.page.imagesSkipped > 0 && `${plural(it.page.imagesSkipped, "image non importée", "images non importées")}`,
                it.page.linksFlattened > 0 && `${plural(it.page.linksFlattened, "lien interne retiré", "liens internes retirés")}`,
              ].filter(Boolean).join(" · ");
              return (
                <li key={it.id} className="flex items-center gap-3 px-3 py-2.5">
                  <FileText size={16} className="shrink-0 text-zinc-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.page.title}</p>
                    <p className="truncate text-xs text-zinc-400">{it.filename} · {Math.max(1, Math.round(it.size / 1024))} Ko</p>
                    {notes && <p className="text-xs text-amber-600 dark:text-amber-400">{notes}</p>}
                  </div>
                  <button
                    type="button" aria-label={`Retirer ${it.filename}`} disabled={busy}
                    onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
                    className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
                  ><X size={15} /></button>
                </li>
              );
            })}
          </ul>
        )}

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">Annuler</button>
          <button
            type="button" onClick={() => void submit()} disabled={busy || items.length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? "Import…" : items.length > 1 ? `Importer ${items.length} pages` : "Importer"}
          </button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
