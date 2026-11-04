import { Link } from 'react-router-dom'
import { useReviewQueue } from '../hooks/useReviews'
export default function TodayReviewsCard() {
  const { data, error, isPending } = useReviewQueue({ limit: 3 })
  return (
    <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="mb-4 flex justify-between gap-2">
        <h2 className="text-sm font-medium text-zinc-500">
          À réviser aujourd’hui
        </h2>
        <Link
          className="text-xs text-indigo-600 dark:text-indigo-400"
          to="/revisions"
        >
          Tout voir
        </Link>
      </div>
      {isPending && <p className="text-sm text-zinc-500">Chargement…</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error.message}
        </p>
      )}
      {data && (
        <>
          <p className="mb-3 text-sm">
            {data.total} rappel{data.total > 1 ? 's' : ''} prévu
            {data.total > 1 ? 's' : ''} aujourd’hui, dont {data.counts.now} dès
            maintenant.
          </p>
          <ul className="space-y-2">
            {data.items.map((item) => (
              <li key={item.id}>
                <Link
                  className="text-sm hover:underline"
                  to={`/chapitres/${item.id}`}
                >
                  {item.title}{' '}
                  <span className="text-xs text-zinc-500">
                    · {item.subject_name} ·{' '}
                    {item.memory.retention === null
                      ? 'Premier rappel'
                      : `≈ ${Math.round(item.memory.retention * 100)} %`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-zinc-500">
            Rétention estimée, non calibrée sur votre mémoire.
          </p>
        </>
      )}
    </section>
  )
}
