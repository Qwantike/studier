import { ChevronLeft, ChevronRight, Link2, Plus, Trash2, Upload, X } from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useSearchParams } from "react-router-dom";
import type { CalendarEvent } from "../api/types";
import CalendarSourcesModal from "../components/CalendarSourcesModal";
import ErrorMessage from "../components/ErrorMessage";
import EventModal from "../components/EventModal";
import WeekGrid from "../components/WeekGrid";
import { useCalendarMutations, useWeekEvents } from "../hooks/useCalendar";
import { addDays, isSameDay, parseLocalDate, startOfWeek, toDateInput, weekLabel } from "../lib/dates";

type Banner = { kind: "ok" | "error"; text: string };
type ModalState = { event?: CalendarEvent } | null;

export default function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const { importIcs, clearImported } = useCalendarMutations();

  // La semaine affichée vit dans l'URL (?semaine=AAAA-MM-JJ) : rechargement et retour arrière la conservent.
  const raw = params.get("semaine");
  const weekStart = useMemo(
    () => startOfWeek(raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? parseLocalDate(raw) : new Date()),
    [raw]);
  const goTo = (d: Date) => setParams({ semaine: toDateInput(startOfWeek(d)) }, { replace: true });
  const { data: events = [], isLoading, error, refetch } = useWeekEvents(weekStart);

  const today = new Date();
  const defaultDay = isSameDay(startOfWeek(today), weekStart) ? today : weekStart;

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permet de réimporter le même fichier
    if (!file) return;
    try {
      const r = await importIcs.mutateAsync(file);
      setBanner({ kind: "ok", text: `Import terminé : ${r.created} créé(s), ${r.updated} mis à jour, ${r.unchanged} inchangé(s).` });
      if (r.focus_date) goTo(new Date(r.focus_date)); // on affiche la semaine des événements importés
    } catch (err) { setBanner({ kind: "error", text: (err as Error).message }); }
  };

  const onClear = async () => {
    if (!window.confirm("Supprimer tous les événements importés depuis un fichier .ics ? Les événements créés à la main sont conservés.")) return;
    try {
      const r = await clearImported.mutateAsync();
      setBanner({ kind: "ok", text: `${r.deleted} événement(s) importé(s) supprimé(s).` });
    } catch (err) { setBanner({ kind: "error", text: (err as Error).message }); }
  };

  const btn = "flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900";

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Emploi du temps</h1>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".ics,text/calendar" className="hidden" onChange={(e) => void onFile(e)} />
          <button className={btn} onClick={() => fileRef.current?.click()} disabled={importIcs.isPending}>
            <Upload size={15} /> {importIcs.isPending ? "Import…" : "Importer un .ics"}
          </button>
          <button className={btn} onClick={() => setSourcesOpen(true)}>
            <Link2 size={15} /> Calendriers en ligne
          </button>
          <button className={btn} onClick={() => void onClear()} title="Supprimer les événements importés" aria-label="Supprimer les événements importés">
            <Trash2 size={15} />
          </button>
          <button onClick={() => setModal({})} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <Plus size={16} /> Nouvel événement
          </button>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2">
        <button className="rounded-lg border border-zinc-200 p-2 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900" onClick={() => goTo(addDays(weekStart, -7))} aria-label="Semaine précédente"><ChevronLeft size={16} /></button>
        <button className="rounded-lg border border-zinc-200 p-2 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900" onClick={() => goTo(addDays(weekStart, 7))} aria-label="Semaine suivante"><ChevronRight size={16} /></button>
        <button className="rounded-lg px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => goTo(new Date())}>Aujourd'hui</button>
        <span className="ml-2 text-sm font-medium">{weekLabel(weekStart)}</span>
      </div>

      {banner && (
        <div className={`mt-4 flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-sm ${banner.kind === "ok"
          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"}`}>
          <span>{banner.text}</span>
          <button onClick={() => setBanner(null)} aria-label="Fermer"><X size={15} /></button>
        </div>
      )}

      <div className="mt-4">
        {error && <div className="mb-3"><ErrorMessage message={error.message} onRetry={() => void refetch()} /></div>}
        {isLoading ? <p className="text-sm text-zinc-500">Chargement…</p> : (
          <>
            <WeekGrid weekStart={weekStart} events={events} onSelect={(event) => setModal({ event })} />
            {events.length === 0 && (
              <p className="mt-3 text-center text-sm text-zinc-400">Aucun événement cette semaine. Importez un fichier .ics ou ajoutez un événement.</p>
            )}
          </>
        )}
      </div>

      {sourcesOpen && <CalendarSourcesModal onClose={() => setSourcesOpen(false)} onFocus={(iso) => goTo(new Date(iso))} />}
      {modal && <EventModal event={modal.event} defaultDay={defaultDay} onClose={() => setModal(null)} />}
    </main>
  );
}
