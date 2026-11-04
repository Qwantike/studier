import { Link } from 'react-router-dom'
import { useChapterReviews } from '../hooks/useReviews'
import type { ChapterStatus } from '../api/types'
import { REVIEW_LABELS } from '../../../shared/reviewModel'
import ReviewButtons from './ReviewButtons'
import RetentionChart from './RetentionChart'
import ErrorMessage from './ErrorMessage'
export default function ChapterReviewPanel({
  chapterId,
  onRecorded,
}: {
  chapterId: string
  onRecorded: (status: ChapterStatus) => void
}) {
  const { data, error, isPending, refetch } = useChapterReviews(chapterId)
  const format = (value: string) =>
    new Date(value).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  return (
    <section
      className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
      aria-label="Répétition espacée"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">Révisions et mémoire</h2>
        <Link
          to="/revisions"
          className="text-xs text-indigo-600 dark:text-indigo-400"
        >
          À réviser aujourd’hui
        </Link>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Rétention estimée, non calibrée sur votre mémoire. Le statut « Révisé »
        ne garantit pas la mémorisation.
      </p>
      {isPending && <p className="mt-3 text-sm">Chargement du suivi…</p>}
      {error && (
        <ErrorMessage message={error.message} onRetry={() => void refetch()} />
      )}
      {data && (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-3">
            <strong className="text-xl">
              {data.chapter.memory.active &&
              data.chapter.memory.retention !== null
                ? `≈ ${Math.round(data.chapter.memory.retention * 100)} %`
                : data.chapter.memory.active
                  ? 'Première révision à planifier'
                  : 'Suivi en pause'}
            </strong>
            <span className="text-xs text-zinc-500">
              {data.chapter.memory.due_today
                ? data.chapter.memory.due_now
                  ? 'À réviser maintenant'
                  : 'Prévu plus tard aujourd’hui'
                : data.chapter.memory.due_day
                  ? `Prochain rappel : ${data.chapter.memory.due_day}`
                  : 'Marquez le chapitre « Vu » ou enregistrez une première révision.'}
            </span>
          </div>
          {data.chapter.memory.active &&
            data.chapter.memory.anchor_at === null && (
              <p className="mt-2 text-xs text-zinc-500">
                Date d’apprentissage inconnue : aucune rétention estimée avant
                votre première auto-évaluation.
              </p>
            )}
          {data.chapter.memory.review_count === 0 &&
            data.chapter.memory.anchor_at && (
              <p className="mt-2 text-xs text-zinc-500">
                Aucune révision enregistrée. Point de départ du suivi :{' '}
                {format(data.chapter.memory.anchor_at)}.
              </p>
            )}
          {data.chapter.evaluation_id && (
            <p className="mt-2 text-xs">
              Évaluation liée :{' '}
              <Link
                className="text-indigo-600 dark:text-indigo-400"
                to={`/evaluations/${data.chapter.evaluation_id}`}
              >
                {data.chapter.evaluation_title} ({data.chapter.evaluation_date})
              </Link>
              {data.chapter.memory.exam_advanced &&
                ' · rappel avancé pour la préparation.'}
            </p>
          )}
          {data.chapter.memory.active && (
            <RetentionChart memory={data.chapter.memory} />
          )}
          <div className="mt-4">
            <ReviewButtons chapterId={chapterId} onRecorded={onRecorded} />
          </div>
          <details className="mt-4 text-xs">
            <summary className="cursor-pointer text-zinc-500">
              Historique ({data.chapter.memory.review_count} révision
              {data.chapter.memory.review_count > 1 ? 's' : ''})
            </summary>
            {data.history.length === 0 ? (
              <p className="mt-2">Pas encore d’auto-évaluation.</p>
            ) : (
              <ol className="mt-2 space-y-2">
                {data.history.map((review) => (
                  <li key={review.id}>
                    {format(review.reviewed_at)} ·{' '}
                    {REVIEW_LABELS[review.rating]} · stabilité estimée{' '}
                    {review.stability_days.toFixed(1)} j
                  </li>
                ))}
              </ol>
            )}
            {data.chapter.memory.review_count > 50 && (
              <p>
                Les 50 dernières révisions sont affichées ; l’export complet
                contient tout l’historique.
              </p>
            )}
          </details>
          <p className="mt-3 text-xs text-zinc-500">
            Le modèle repart de 100 % à chaque essai, même après « À revoir » :
            ce n’est pas un score de maîtrise. Un échec programme un rappel plus
            proche.
          </p>
        </>
      )}
    </section>
  )
}
