import { Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import EvaluationForm from "../components/EvaluationForm";
import ErrorMessage from "../components/ErrorMessage";
import EvaluationCard from "../components/EvaluationCard";
import { useEvaluations } from "../hooks/useEvaluations";
import { daysUntil } from "../lib/dates";

export default function EvaluationsPage() {
  const { data, isLoading, error, refetch } = useEvaluations();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const upcoming = (data ?? []).filter((e) => daysUntil(e.date) >= 0);
  const past = (data ?? []).filter((e) => daysUntil(e.date) < 0).reverse();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Évaluations</h1>
        <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus size={16} /> Nouvelle évaluation
        </button>
      </div>

      {isLoading && <p className="mt-8 text-sm text-zinc-500">Chargement…</p>}
      {error && <div className="mt-8"><ErrorMessage message={error.message} onRetry={() => void refetch()} /></div>}
      {data && data.length === 0 && (
        <p className="mt-8 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Aucune évaluation pour l'instant. Créez-en une et liez-la aux chapitres à réviser.
        </p>
      )}

      {upcoming.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium text-zinc-500">À venir</h2>
          <div className="space-y-2">{upcoming.map((e) => <EvaluationCard key={e.id} ev={e} />)}</div>
        </section>
      )}
      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-zinc-500">Passées</h2>
          <div className="space-y-2">{past.map((e) => <EvaluationCard key={e.id} ev={e} />)}</div>
        </section>
      )}

      {creating && <EvaluationForm onClose={() => setCreating(false)} onSaved={(id) => navigate(`/evaluations/${id}`)} />}
    </main>
  );
}
