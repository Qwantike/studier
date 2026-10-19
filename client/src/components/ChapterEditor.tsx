import { Check, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Chapter } from "../api/types";
import { useChapterSaver, type SaveState } from "../hooks/useChapterSaver";
import { useEvaluations } from "../hooks/useEvaluations";
import { countdownClass, countdownLabel, daysUntil } from "../lib/dates";
import MarkdownEditor from "./MarkdownEditor";
import StatusPills from "./StatusPills";

function SaveIndicator({ state }: { state: SaveState }) {
  const base = "flex items-center gap-1.5 text-xs";
  if (state === "saving") return <span className={`${base} text-zinc-400`}><Loader2 size={13} className="animate-spin" /> Enregistrement…</span>;
  if (state === "dirty") return <span className={`${base} text-zinc-400`}>Modifié…</span>;
  if (state === "error") return <span className={`${base} text-red-600`}><TriangleAlert size={13} /> Échec, nouvelle tentative…</span>;
  return <span className={`${base} text-zinc-400`}><Check size={13} /> Enregistré</span>;
}

// Monté avec key={chapter.id} : l'état local repart à zéro à chaque changement de chapitre.
export default function ChapterEditor({ chapter }: { chapter: Chapter }) {
  const { state, queue, flush } = useChapterSaver(chapter.id);
  const { data: evaluations } = useEvaluations({ chapter_id: chapter.id });
  const [title, setTitle] = useState(chapter.title);
  const [status, setStatus] = useState(chapter.status);
  const titleRef = useRef<HTMLInputElement>(null);

  // Un renommage fait depuis la barre latérale met à jour le champ (sauf pendant la saisie).
  useEffect(() => {
    if (document.activeElement !== titleRef.current) setTitle(chapter.title);
  }, [chapter.title]);

  return (
    <main className="mx-auto max-w-[720px] px-4 py-8 sm:px-6 sm:py-14">
      <input
        ref={titleRef}
        value={title}
        placeholder="Titre du chapitre"
        onChange={(e) => {
          setTitle(e.target.value);
          if (e.target.value.trim()) queue({ title: e.target.value.trim() }); // un titre vide n'est jamais envoyé
        }}
        onBlur={() => { if (!title.trim()) setTitle(chapter.title); }}
        className="w-full bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-zinc-300"
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <StatusPills value={status} onChange={(s) => { setStatus(s); queue({ status: s }); void flush(); }} />
        <SaveIndicator state={state} />
      </div>

      {evaluations && evaluations.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>Au programme de :</span>
          {evaluations.map((ev) => {
            const days = daysUntil(ev.date);
            return (
              <Link key={ev.id} to={`/evaluations/${ev.id}`} className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-1 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: ev.subject_color }} />
                {ev.title}
                <span className={`rounded-full px-1.5 py-0.5 ${countdownClass(days)}`}>{countdownLabel(days)}</span>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-8">
        <MarkdownEditor initial={chapter.content_md} onChange={(md) => queue({ content_md: md })} />
      </div>
    </main>
  );
}
