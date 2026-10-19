import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { CalendarSource, SyncResult } from "../api/types";
import { useCalendarSourceMutations, useCalendarSources } from "../hooks/useCalendarSources";
import { relativeTime } from "../lib/dates";
import Modal from "./Modal";

const field = "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900";
const iconBtn = "rounded p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800";

const summary = (r: SyncResult) =>
  `${r.created} créé(s), ${r.updated} mis à jour, ${r.removed} supprimé(s), ${r.unchanged} inchangé(s)`;
const host = (url: string) => { try { return new URL(url).hostname; } catch { return url; } };

interface Props {
  onClose: () => void;
  /** Demande d'afficher la semaine des événements qui viennent d'être ajoutés. */
  onFocus: (isoDate: string) => void;
}

// Abonnements à des calendriers en ligne (URL .ics), resynchronisés automatiquement par le serveur.
export default function CalendarSourcesModal({ onClose, onFocus }: Props) {
  const { data: sources = [], isLoading } = useCalendarSources();
  const { add, sync, syncAll, rename, remove } = useCalendarSourceMutations();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<CalendarSource | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const ok = (text: string) => setNotice({ kind: "ok", text });
  const fail = (err: unknown) => setNotice({ kind: "error", text: (err as Error).message });

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    try {
      const { source, result } = await add.mutateAsync({ url: url.trim(), ...(name.trim() && { name: name.trim() }) });
      setUrl(""); setName("");
      ok(`« ${source.name} » ajouté : ${summary(result)}.`);
      if (result.focus_date) onFocus(result.focus_date);
    } catch (err) { fail(err); }
  };

  const onSync = async (s: CalendarSource) => {
    setNotice(null);
    try { ok(`« ${s.name} » synchronisé : ${summary((await sync.mutateAsync(s.id)).result)}.`); } catch (err) { fail(err); }
  };

  const onSyncAll = async () => {
    setNotice(null);
    try {
      const results = await syncAll.mutateAsync();
      const failed = results.filter((r) => !r.ok);
      if (failed.length === 0) ok("Tous les calendriers sont à jour.");
      else setNotice({ kind: "error", text: failed.map((r) => `« ${r.name} » : ${r.error}`).join(" — ") });
    } catch (err) { fail(err); }
  };

  const onRename = async (s: CalendarSource) => {
    const next = window.prompt("Nouveau nom du calendrier", s.name)?.trim();
    if (!next || next === s.name) return;
    try { await rename.mutateAsync({ id: s.id, name: next }); } catch (err) { fail(err); }
  };

  const onDelete = async (deleteEvents: boolean) => {
    if (!deleting) return;
    try { await remove.mutateAsync({ id: deleting.id, deleteEvents }); setDeleting(null); ok("Abonnement supprimé."); }
    catch (err) { fail(err); setDeleting(null); }
  };

  return (
    <Modal title="Calendriers en ligne" onClose={onClose}>
      {deleting ? (
        <div className="space-y-4">
          <p className="text-sm">
            Supprimer l'abonnement <strong>{deleting.name}</strong> ? Il compte {deleting.event_count} événement(s) synchronisé(s).
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => setDeleting(null)} className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">Annuler</button>
            <button onClick={() => void onDelete(false)} disabled={remove.isPending} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Garder les événements</button>
            <button onClick={() => void onDelete(true)} disabled={remove.isPending} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Tout supprimer</button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-zinc-500">
            Abonnez-vous à l'adresse .ics d'un calendrier (ADE, Google Agenda, Outlook…). Il est resynchronisé automatiquement ;
            les événements supprimés à la source disparaissent de l'avenir, le passé est conservé.
          </p>

          {isLoading && <p className="text-sm text-zinc-400">Chargement…</p>}
          {sources.length > 0 && (
            <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {sources.map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="truncate text-xs text-zinc-400">{host(s.url)}</p>
                    {s.last_error ? (
                      <p className="mt-0.5 text-xs text-red-600">Échec de la dernière synchronisation : {s.last_error}</p>
                    ) : (
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {s.last_synced_at ? `Synchronisé ${relativeTime(s.last_synced_at)}` : "Jamais synchronisé"} · {s.event_count} événement(s)
                      </p>
                    )}
                  </div>
                  <button className={iconBtn} onClick={() => void onSync(s)} disabled={sync.isPending} aria-label="Synchroniser" title="Synchroniser maintenant">
                    <RefreshCw size={15} className={sync.isPending && sync.variables === s.id ? "animate-spin" : ""} />
                  </button>
                  <button className={iconBtn} onClick={() => void onRename(s)} aria-label="Renommer" title="Renommer"><Pencil size={15} /></button>
                  <button className={`${iconBtn} hover:text-red-600`} onClick={() => setDeleting(s)} aria-label="Supprimer" title="Supprimer"><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          )}
          {sources.length > 1 && (
            <button onClick={() => void onSyncAll()} disabled={syncAll.isPending} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-60">
              {syncAll.isPending ? "Synchronisation…" : "Tout synchroniser"}
            </button>
          )}

          <form onSubmit={(e) => void onAdd(e)} className="space-y-3 border-t border-zinc-100 pt-5 dark:border-zinc-800">
            <p className="text-sm font-medium">Ajouter un calendrier</p>
            <input className={field} value={url} onChange={(e) => setUrl(e.target.value)} required
              placeholder="https://… ou webcal://…" aria-label="Adresse du calendrier" />
            <input className={field} value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Nom (facultatif, repris du calendrier sinon)" aria-label="Nom du calendrier" />
            <div className="flex justify-end">
              <button type="submit" disabled={add.isPending || !url.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                {add.isPending ? "Ajout en cours…" : "Ajouter"}
              </button>
            </div>
          </form>

          {notice && (
            <p className={`rounded-lg px-3 py-2 text-sm ${notice.kind === "ok"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"}`}>{notice.text}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
