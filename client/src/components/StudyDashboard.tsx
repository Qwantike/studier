import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { reviewTimezone } from '../hooks/useReviews'
import type {
  StudyDashboard as StudyData,
  StudyPreferences,
} from '../../../shared/studyActivity'
import ErrorMessage from './ErrorMessage'

type Response = StudyData | { preferences: StudyPreferences }
export default function StudyDashboard() {
  const cache = useQueryClient()
  const timezone = reviewTimezone()
  const query = useQuery({
    queryKey: ['study', timezone],
    queryFn: () =>
      api<Response>(`/study?timezone=${encodeURIComponent(timezone)}`),
    refetchInterval: 60000,
  })
  const update = useMutation({
    mutationFn: (value: Partial<StudyPreferences>) =>
      api<StudyPreferences>('/study/preferences', {
        method: 'PATCH',
        body: JSON.stringify(value),
      }),
    onSuccess: async (preferences) => {
      // Retirer immédiatement les statistiques cachées après désactivation.
      if (!preferences.enabled)
        cache.setQueryData(['study', timezone], { preferences })
      await cache.invalidateQueries({ queryKey: ['study'] })
    },
  })
  const data = query.data
  const stats = data && 'today' in data ? data : undefined
  const button =
    'rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 disabled:opacity-50'
  return (
    <section
      aria-label="Parcours d’étude"
      className="mt-6 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800"
    >
      <h2 className="font-medium">Mon parcours d’étude</h2>
      {query.isPending && <p role="status">Chargement du parcours…</p>}
      {query.error && (
        <ErrorMessage
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      )}
      {update.error && <ErrorMessage message={update.error.message} />}
      {data && (
        <>
          <p className="my-3 text-sm text-zinc-500">
            Un repère facultatif, à votre rythme. Les pauses font partie de
            l’apprentissage.
          </p>
          <button
            className={button}
            disabled={update.isPending}
            onClick={() =>
              update.mutate({ enabled: !data.preferences.enabled })
            }
          >
            {data.preferences.enabled
              ? 'Masquer mon parcours'
              : 'Afficher mon parcours'}
          </button>
          {data.preferences.enabled && stats && (
            <div className="mt-5 space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <p>
                  <strong>{stats.current_streak}</strong> jour(s) de suite
                  <br />
                  <span className="text-sm text-zinc-500">
                    Aujourd’hui ou jusqu’à hier
                  </span>
                </p>
                <p>
                  <strong>{stats.best_streak}</strong> jour(s) : plus longue
                  série
                </p>
                <p>
                  <strong>{stats.total_reviews}</strong> rappel(s) enregistré(s)
                </p>
              </div>
              <div>
                <label htmlFor="weekly-study-days" className="mr-3 text-sm">
                  Mon objectif hebdomadaire
                </label>
                <select
                  id="weekly-study-days"
                  className="rounded border bg-white p-2 dark:bg-zinc-900"
                  value={data.preferences.weekly_days}
                  disabled={update.isPending}
                  onChange={(e) =>
                    update.mutate({ weekly_days: Number(e.target.value) })
                  }
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <option value={n} key={n}>
                      {n} jour(s)
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-sm">
                  {stats.weekly_days} / {data.preferences.weekly_days} jours
                  cette semaine (lundi à dimanche).
                </p>
                <progress
                  aria-label="Objectif hebdomadaire"
                  className="w-full accent-indigo-600"
                  value={Math.min(
                    stats.weekly_days,
                    data.preferences.weekly_days,
                  )}
                  max={data.preferences.weekly_days}
                />
                {stats.weekly_days >= data.preferences.weekly_days && (
                  <p className="text-sm">
                    Objectif atteint. La suite est à votre rythme.
                  </p>
                )}
              </div>
              <div>
                <h3 className="mb-2 font-medium">Badges</h3>
                <ul className="flex flex-wrap gap-2">
                  {stats.badges.map((b) => (
                    <li
                      key={b.id}
                      className="rounded-lg bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800"
                    >
                      {b.label} — {b.earned ? 'obtenu' : 'à découvrir'}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-medium">Progression par matière</h3>
                <p className="text-sm text-zinc-500">
                  Chapitres au statut « Révisé » ; ce suivi ne mesure pas la
                  maîtrise.
                </p>
                {!stats.subjects.length && (
                  <p className="text-sm">Ajoutez une matière pour commencer.</p>
                )}
                <ul className="mt-3 space-y-3">
                  {stats.subjects.map((s) => (
                    <li key={s.id}>
                      <p>
                        {s.name} : {s.revised} / {s.total} révisé(s)
                      </p>
                      <progress
                        aria-label={`Progression : ${s.name}`}
                        className="w-full accent-indigo-600"
                        value={s.revised}
                        max={s.total || 1}
                      />
                      <p className="text-xs text-zinc-500">
                        {s.reviewed} chapitre(s) avec au moins un rappel
                        enregistré
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-medium">Derniers rappels</h3>
                {!stats.recent.length && (
                  <p className="text-sm">
                    Votre premier rappel apparaîtra ici.
                  </p>
                )}
                <ul className="mt-2 space-y-2 text-sm">
                  {stats.recent.map((a) => (
                    <li key={a.id}>
                      <Link
                        className="text-indigo-600 underline dark:text-indigo-400"
                        to={`/chapitres/${a.chapter_id}`}
                      >
                        {a.title}
                      </Link>{' '}
                      · {a.subject_name} ·{' '}
                      <time dateTime={a.occurred_at}>
                        {new Date(a.occurred_at).toLocaleString('fr-FR', {
                          timeZone: timezone,
                        })}
                      </time>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-zinc-500">
                Chaque rappel compte, y compris « À revoir ». Plusieurs rappels
                dans une journée comptent pour un seul jour d’étude. Masquer ce
                parcours conserve l’historique des révisions.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  )
}
