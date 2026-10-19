import { useState } from "react";
import type { CalendarEvent } from "../api/types";
import { useCalendarMutations } from "../hooks/useCalendar";
import { useSubjectOptions } from "../hooks/useSubjectOptions";
import { toLocalInput } from "../lib/dates";
import Modal from "./Modal";

const field = "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900";
const label = "mb-1 block text-xs font-medium text-zinc-500";

interface Props {
  /** Événement à modifier ; absent = création. */
  event?: CalendarEvent;
  /** Jour proposé à la création. */
  defaultDay: Date;
  onClose: () => void;
}

export default function EventModal({ event, defaultDay, onClose }: Props) {
  const subjects = useSubjectOptions();
  const { create, update, remove } = useCalendarMutations();

  const at = (h: number) => { const d = new Date(defaultDay); d.setHours(h, 0, 0, 0); return toLocalInput(d); };
  const [title, setTitle] = useState(event?.title ?? "");
  const [start, setStart] = useState(event ? toLocalInput(event.starts_at) : at(8));
  const [end, setEnd] = useState(event ? toLocalInput(event.ends_at) : at(10));
  const [location, setLocation] = useState(event?.location ?? "");
  const [subjectId, setSubjectId] = useState(event?.subject_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending || remove.isPending;

  // Changer le début déplace la fin pour conserver la durée.
  const onStart = (value: string) => {
    const delta = new Date(end).getTime() - new Date(start).getTime();
    setStart(value);
    const next = new Date(value).getTime() + delta;
    if (!Number.isNaN(next) && delta >= 0) setEnd(toLocalInput(new Date(next)));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const s = new Date(start);
    const en = new Date(end);
    if (!title.trim()) return setError("Le titre est requis.");
    if (Number.isNaN(s.getTime()) || Number.isNaN(en.getTime())) return setError("Dates invalides.");
    if (en < s) return setError("La fin doit être après le début.");
    const body = {
      title: title.trim(), starts_at: s.toISOString(), ends_at: en.toISOString(),
      location: location.trim() || null, subject_id: subjectId || null,
    };
    try {
      if (event) await update.mutateAsync({ id: event.id, body });
      else await create.mutateAsync(body);
      onClose();
    } catch (err) { setError((err as Error).message); }
  };

  const onDelete = async () => {
    if (!event || !window.confirm(`Supprimer « ${event.title} » ?`)) return;
    try { await remove.mutateAsync(event.id); onClose(); } catch (err) { setError((err as Error).message); }
  };

  return (
    <Modal title={event ? "Événement" : "Nouvel événement"} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <div>
          <label className={label} htmlFor="evt-title">Titre</label>
          <input id="evt-title" autoFocus className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="evt-start">Début</label>
            <input id="evt-start" type="datetime-local" required className={field} value={start} onChange={(e) => onStart(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="evt-end">Fin</label>
            <input id="evt-end" type="datetime-local" required className={field} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="evt-loc">Lieu (facultatif)</label>
          <input id="evt-loc" className={field} value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="evt-subject">Matière (facultatif)</label>
          <select id="evt-subject" className={field} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Aucune</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.path} · {s.name}</option>)}
          </select>
        </div>

        {event?.imported && (
          <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:bg-zinc-800/50">
            {event.source_name ? `Synchronisé depuis « ${event.source_name} »` : "Importé d'un fichier .ics"} : à la prochaine
            {event.source_name ? " synchronisation" : " importation"}, son titre, son horaire et son lieu seront remis à jour d'après la source. La matière que vous choisissez ici est conservée.
          </p>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

        <div className="flex items-center justify-between pt-1">
          {event ? (
            <button type="button" onClick={() => void onDelete()} disabled={busy} className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950">Supprimer</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">Annuler</button>
            <button type="submit" disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
