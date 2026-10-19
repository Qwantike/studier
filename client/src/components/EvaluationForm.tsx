import { useMemo, useState } from "react";
import { EVAL_TYPE_LABELS, STATUS_DOT, type EvalType, type EvaluationDetail } from "../api/types";
import { useEvaluationMutations, type EvaluationInput } from "../hooks/useEvaluations";
import { useTree } from "../hooks/useTree";
import { toDateInput } from "../lib/dates";
import Modal from "./Modal";

const field = "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900";
const label = "mb-1 block text-xs font-medium text-zinc-500";
const toNum = (s: string): number | null => (s.trim() === "" ? null : Number(s));

interface Props {
  /** Évaluation à modifier ; absent = création. */
  initial?: EvaluationDetail;
  /** Matière présélectionnée à la création. */
  defaultSubjectId?: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}

export default function EvaluationForm({ initial, defaultSubjectId, onClose, onSaved }: Props) {
  const { data: tree } = useTree();
  const { create, update } = useEvaluationMutations();

  // Matières à plat (année · semestre · matière) avec leurs chapitres.
  const subjects = useMemo(
    () => (tree ?? []).flatMap((y) => y.semesters.flatMap((s) =>
      s.subjects.map((su) => ({ ...su, path: `${y.label} · ${s.label}` })))),
    [tree]);

  const [subjectId, setSubjectId] = useState(initial?.subject_id ?? defaultSubjectId ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState<EvalType>(initial?.type ?? "controle");
  const [date, setDate] = useState(initial?.date ?? toDateInput(new Date()));
  const [coef, setCoef] = useState(initial?.coefficient?.toString() ?? "");
  const [grade, setGrade] = useState(initial?.grade?.toString() ?? "");
  const [chapterIds, setChapterIds] = useState<string[]>(initial?.chapters.map((c) => c.id) ?? []);
  const [error, setError] = useState<string | null>(null);

  // Sans matière choisie, on prend la première disponible.
  const effectiveSubjectId = subjectId || subjects[0]?.id || "";
  const chapters = subjects.find((s) => s.id === effectiveSubjectId)?.chapters ?? [];
  const saving = create.isPending || update.isPending;

  const toggleChapter = (id: string) =>
    setChapterIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!effectiveSubjectId) return setError("Créez d'abord une matière dans la barre latérale.");
    if (!title.trim()) return setError("Le titre est requis.");
    const body: EvaluationInput = {
      subject_id: effectiveSubjectId, title: title.trim(), type, date,
      coefficient: toNum(coef), grade: toNum(grade),
      chapter_ids: chapterIds.filter((id) => chapters.some((c) => c.id === id)),
    };
    try {
      const saved = initial
        ? await update.mutateAsync({ id: initial.id, body })
        : await create.mutateAsync(body);
      onSaved(saved.id);
    } catch (err) { setError((err as Error).message); }
  };

  return (
    <Modal title={initial ? "Modifier l'évaluation" : "Nouvelle évaluation"} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <div>
          <label className={label} htmlFor="ev-title">Titre</label>
          <input id="ev-title" autoFocus className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Contrôle 1" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={label} htmlFor="ev-subject">Matière</label>
            <select
              id="ev-subject" className={field} value={effectiveSubjectId}
              onChange={(e) => { setSubjectId(e.target.value); setChapterIds([]); }}
            >
              {subjects.length === 0 && <option value="">Aucune matière</option>}
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.path} · {s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ev-type">Type</label>
            <select id="ev-type" className={field} value={type} onChange={(e) => setType(e.target.value as EvalType)}>
              {Object.entries(EVAL_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ev-date">Date</label>
            <input id="ev-date" type="date" required className={field} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="ev-coef">Coefficient (facultatif)</label>
            <input id="ev-coef" type="number" min="0" step="any" className={field} value={coef} onChange={(e) => setCoef(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="ev-grade">Note /20 (facultatif)</label>
            <input id="ev-grade" type="number" min="0" max="20" step="any" className={field} value={grade} onChange={(e) => setGrade(e.target.value)} />
          </div>
        </div>

        <fieldset>
          <legend className={label}>Chapitres concernés</legend>
          {chapters.length === 0 ? (
            <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-400 dark:bg-zinc-800/50">Cette matière n'a pas encore de chapitre.</p>
          ) : (
            <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-zinc-200 p-1.5 dark:border-zinc-700">
              {chapters.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
                    <input type="checkbox" checked={chapterIds.includes(c.id)} onChange={() => toggleChapter(c.id)} className="accent-indigo-600" />
                    <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[c.status]}`} />
                    <span className="truncate">{c.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">Annuler</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
            {saving ? "Enregistrement…" : initial ? "Enregistrer" : "Créer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
