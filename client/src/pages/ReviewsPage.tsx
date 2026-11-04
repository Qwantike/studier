import { Link, useSearchParams } from 'react-router-dom'
import { useReviewQueue } from '../hooks/useReviews'
import { useTree } from '../hooks/useTree'
import ReviewButtons from '../components/ReviewButtons'
import ErrorMessage from '../components/ErrorMessage'
export default function ReviewsPage() {
  const [params, setParams] = useSearchParams(),
    scope = params.get('scope') === 'all' ? 'all' : 'today'
  const evaluation_id = params.get('evaluation_id') || undefined,
    subject_id = params.get('subject_id') || undefined
  const offset = Math.max(0, Number(params.get('offset')) || 0)
  const { data, error, isPending, refetch } = useReviewQueue({
    scope,
    evaluation_id,
    subject_id,
    offset,
    limit: 50,
  })
  const { data: tree } = useTree()
  const subjects =
    tree?.flatMap((y) =>
      y.semesters.flatMap((s) =>
        s.subjects.map((subject) => ({
          id: subject.id,
          name: `${y.label} · ${s.label} · ${subject.name}`,
        })),
      ),
    ) ?? []
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('offset')
    setParams(next)
  }
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-14">
      <h1 className="text-2xl font-semibold">Révisions espacées</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Une estimation pour organiser vos rappels, sans calibration
        individuelle. Testez votre restitution avant de vous auto-évaluer.
      </p>
      <div className="my-5 flex flex-wrap gap-3">
        <label className="text-sm">
          Afficher{' '}
          <select
            value={scope}
            onChange={(e) => change('scope', e.target.value)}
            className="ml-2 rounded border bg-transparent p-2 dark:border-zinc-700"
          >
            <option value="today">À réviser aujourd’hui</option>
            <option value="all">Tous les chapitres</option>
          </select>
        </label>
        <label className="text-sm">
          Matière{' '}
          <select
            value={subject_id ?? ''}
            onChange={(e) => change('subject_id', e.target.value)}
            className="ml-2 max-w-full rounded border bg-transparent p-2 dark:border-zinc-700"
          >
            <option value="">Toutes</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {evaluation_id && (
          <button
            type="button"
            onClick={() => change('evaluation_id', '')}
            className="text-xs text-indigo-600 dark:text-indigo-400"
          >
            Retirer le filtre d’évaluation
          </button>
        )}
      </div>
      {error && (
        <ErrorMessage message={error.message} onRetry={() => void refetch()} />
      )}
      {isPending && <p>Chargement…</p>}
      {data && (
        <>
          <p className="mb-4 text-sm text-zinc-500">
            {data.counts.today} à revoir aujourd’hui, dont {data.counts.now} dès
            maintenant · {data.counts.unstarted} en pause ou non commencés. Jour
            local : {data.today} ({data.timezone}).
          </p>
          {data.items.length === 0 && (
            <p className="rounded-xl border border-dashed p-6 text-sm dark:border-zinc-700">
              {offset > 0
                ? 'Cette page est vide.'
                : scope === 'today'
                  ? 'Aucun rappel prévu aujourd’hui. Les chapitres non commencés sont dans « Tous les chapitres ».'
                  : 'Aucun chapitre pour ces filtres.'}
            </p>
          )}
          <ul className="space-y-4">
            {data.items.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <p className="text-xs text-zinc-500">
                  {item.year_label} · {item.semester_label} ·{' '}
                  {item.subject_name}
                </p>
                <div className="my-2 flex flex-wrap items-center justify-between gap-2">
                  <Link
                    to={`/chapitres/${item.id}`}
                    className="font-medium text-indigo-600 dark:text-indigo-400"
                  >
                    {item.title}
                  </Link>
                  <span className="text-sm">
                    {item.memory.active && item.memory.retention !== null
                      ? `≈ ${Math.round(item.memory.retention * 100)} % estimés`
                      : item.memory.active
                        ? 'Premier rappel'
                        : 'Suivi en pause'}
                  </span>
                </div>
                <p className="mb-3 text-xs text-zinc-500">
                  {item.memory.due_now
                    ? 'À réviser maintenant'
                    : item.memory.due_today
                      ? 'Rappel plus tard aujourd’hui'
                      : item.memory.due_day
                        ? `Prochain rappel : ${item.memory.due_day}`
                        : 'Pas encore de rappel'}
                  {item.memory.exam_advanced && ' · avancé pour l’évaluation'}
                </p>
                {item.evaluation_id && (
                  <p className="mb-3 text-xs">
                    Évaluation :{' '}
                    <Link
                      className="underline"
                      to={`/evaluations/${item.evaluation_id}`}
                    >
                      {item.evaluation_title} ({item.evaluation_date})
                    </Link>
                  </p>
                )}
                <ReviewButtons chapterId={item.id} />
              </li>
            ))}
          </ul>
          <nav
            aria-label="Pages de révisions"
            className="mt-5 flex items-center gap-4"
          >
            <button
              disabled={offset === 0}
              className="disabled:opacity-40"
              onClick={() => {
                const next = new URLSearchParams(params)
                next.set('offset', String(Math.max(0, offset - 50)))
                setParams(next)
              }}
            >
              Précédent
            </button>
            <span className="text-xs">
              {data.total} chapitre(s) · page {Math.floor(offset / 50) + 1}
            </span>
            <button
              disabled={offset + 50 >= data.total}
              className="disabled:opacity-40"
              onClick={() => {
                const next = new URLSearchParams(params)
                next.set('offset', String(offset + 50))
                setParams(next)
              }}
            >
              Suivant
            </button>
          </nav>
        </>
      )}
    </main>
  )
}
