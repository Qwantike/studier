import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EVAL_TYPE_LABELS } from "../api/types";
import { isNotFound } from "../api/client";
import ErrorMessage from "../components/ErrorMessage";
import EvaluationForm from "../components/EvaluationForm";
import ProgressBar from "../components/ProgressBar";
import StatusPills from "../components/StatusPills";
import { useEvaluation, useEvaluationMutations, useSetChapterStatus } from "../hooks/useEvaluations";
import { countdownClass, countdownLabel, daysUntil, formatDate } from "../lib/dates";

// Vue "Préparation" : compte à rebours, progression et statut des chapitres liés.
export default function EvaluationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: ev, isLoading, error, refetch } = useEvaluation(id);
  const { remove } = useEvaluationMutations();
  const setStatus = useSetChapterStatus();
  const [editing, setEditing] = useState(false);

  if (isLoading) return <p className="p-6 sm:p-10 text-sm text-zinc-500">Chargement…</p>;
  if (error && !isNotFound(error)) {
    return <main className="mx-auto max-w-xl p-6"><ErrorMessage message={error.message} onRetry={() => void refetch()} /></main>;
  }
  if (error || !ev) {
    return <p className="p-6 sm:p-10 text-sm text-zinc-500">Évaluation introuvable. <Link to="/evaluations" className="text-indigo-600 dark:text-indigo-400 underline">Retour aux évaluations</Link></p>;
  }

  const days = daysUntil(ev.date);
  const pct = ev.chapter_total > 0 ? Math.round((ev.chapter_revised / ev.chapter_total) * 100) : 0;

  const onDelete = () => {
    if (!window.confirm(`Supprimer l'évaluation « ${ev.title} » ? Les chapitres ne sont pas touchés.`)) return;
    remove.mutate(ev.id, { onSuccess: () => navigate("/evaluations") });
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
      <Link to="/evaluations" className="mb-6 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        <ArrowLeft size={15} /> Évaluations
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{ev.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500">
            <span className="h-2 w-2 rounded-full" style={{ background: ev.subject_color }} />
            {ev.subject_name} · {EVAL_TYPE_LABELS[ev.type]} · {formatDate(ev.date)}
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            {ev.coefficient !== null && <>Coefficient {ev.coefficient}</>}
            {ev.coefficient !== null && ev.grade !== null && " · "}
            {ev.grade !== null && <>Note : {ev.grade}/20</>}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button onClick={() => setEditing(true)} aria-label="Modifier" title="Modifier" className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><Pencil size={16} /></button>
          <button onClick={onDelete} aria-label="Supprimer" title="Supprimer" className="rounded-lg p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"><Trash2 size={16} /></button>
        </div>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <p className="text-xs font-medium text-zinc-500">Compte à rebours</p>
          <p className="mt-2 flex items-baseline gap-2">
            {days > 1 && <span className="text-4xl font-semibold tracking-tight">{days}</span>}
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${countdownClass(days)}`}>
              {days > 1 ? "jours restants" : countdownLabel(days)}
            </span>
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <p className="text-xs font-medium text-zinc-500">Préparation</p>
          {ev.chapter_total > 0 ? (
            <>
              <p className="mt-2 text-4xl font-semibold tracking-tight">{pct}<span className="text-xl text-zinc-400"> %</span></p>
              <ProgressBar value={ev.chapter_revised} total={ev.chapter_total} className="mt-3" />
              <p className="mt-2 text-xs text-zinc-400">{ev.chapter_revised} chapitre{ev.chapter_revised > 1 ? "s" : ""} révisé{ev.chapter_revised > 1 ? "s" : ""} sur {ev.chapter_total}</p>
            </>
          ) : <p className="mt-2 text-sm text-zinc-400">Aucun chapitre lié.</p>}
        </div>
      </div>

      {(setStatus.isError || remove.isError) && (
        <div className="mt-4"><ErrorMessage message={(setStatus.error ?? remove.error)?.message ?? "Erreur"} /></div>
      )}

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium text-zinc-500">Chapitres à réviser</h2>
        {ev.chapters.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
            Aucun chapitre lié. <button onClick={() => setEditing(true)} className="text-indigo-600 dark:text-indigo-400 underline">Choisir des chapitres</button>
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {ev.chapters.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <Link to={`/chapitres/${c.id}`} className="min-w-0 truncate text-sm font-medium hover:text-indigo-600">{c.title}</Link>
                <StatusPills compact value={c.status} onChange={(status) => setStatus.mutate({ id: c.id, status })} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && <EvaluationForm initial={ev} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
    </main>
  );
}
