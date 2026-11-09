import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { flushForExport } from '../hooks/useChapterSaver'
import ErrorMessage from '../components/ErrorMessage'
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  type Difficulty,
  type GenerateRequest,
  type QuizConfig,
  type QuizDetail,
  type QuizSummary,
} from '../../../shared/quizzes'
const button =
  'rounded-lg border px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700'
export default function ChapterQuizzesPage() {
  const { id } = useParams()
  return <ChapterQuizzes key={id} chapterId={id!} />
}
function ChapterQuizzes({ chapterId }: { chapterId: string }) {
  const navigate = useNavigate(),
    cache = useQueryClient()
  const [difficulty, setDifficulty] = useState<Difficulty>('medium'),
    [example, setExample] = useState(''),
    [consent, setConsent] = useState(false)
  const [request, setRequest] = useState<GenerateRequest | null>(null)
  const config = useQuery({
    queryKey: ['quiz-config'],
    queryFn: () => api<QuizConfig>('/quizzes/config'),
  })
  const list = useQuery({
    queryKey: ['quizzes', chapterId],
    queryFn: () => api<QuizSummary[]>(`/chapters/${chapterId}/quizzes`),
    refetchInterval: 5000,
  })
  const generate = useMutation({
    retry: false,
    mutationFn: async (body: GenerateRequest) => {
      await flushForExport(chapterId)
      return api<QuizDetail>(`/chapters/${chapterId}/quizzes`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },
    onSuccess: async (quiz) => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['quiz-config'] }),
        cache.invalidateQueries({ queryKey: ['quizzes', chapterId] }),
      ])
      navigate(`/qcm/${quiz.id}`)
    },
    onError: () => {
      void cache.invalidateQueries({ queryKey: ['quiz-config'] })
      void cache.invalidateQueries({ queryKey: ['quizzes', chapterId] })
    },
  })
  function submit(e: FormEvent) {
    e.preventDefault()
    if (!consent || !config.data?.enabled) return
    const body = request ?? {
      id: crypto.randomUUID(),
      difficulty,
      example,
      consent: true as const,
    }
    setRequest(body)
    generate.mutate(body)
  }
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <Link
        className="text-sm text-indigo-600 underline"
        to={`/chapitres/${chapterId}`}
      >
        Retour au chapitre
      </Link>
      <h1 className="text-2xl font-semibold">QCM d’entraînement</h1>
      <p>
        Cinq questions à choix unique à partir de ce chapitre. La correction ne
        nécessite aucun nouvel appel à l’IA.
      </p>
      {config.isPending && <p role="status">Chargement des limites…</p>}
      {config.error && (
        <ErrorMessage
          message={config.error.message}
          onRetry={() => void config.refetch()}
        />
      )}
      {config.data && (
        <>
          <p className="text-sm">
            {config.data.remaining_today} / {config.data.daily_limit} demandes
            disponibles aujourd’hui. Réinitialisation à minuit UTC.
          </p>
          {!config.data.enabled && (
            <p role="status">
              La génération est désactivée sur ce serveur. Vos QCM enregistrés
              restent accessibles.
            </p>
          )}
          <form
            onSubmit={submit}
            className="space-y-4 rounded-2xl border p-5 dark:border-zinc-800"
          >
            <fieldset
              disabled={generate.isPending || !!request || !config.data.enabled}
              className="space-y-4"
            >
              <legend className="font-medium">Préparer un nouveau QCM</legend>
              <label className="block">
                Difficulté{' '}
                <select
                  className="ml-3 rounded border bg-white p-2 dark:bg-zinc-900"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                >
                  {DIFFICULTIES.map((d) => (
                    <option value={d} key={d}>
                      {DIFFICULTY_LABELS[d]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                Exemple de style d’évaluation (facultatif)
                <textarea
                  className="mt-2 w-full rounded-lg border bg-white p-3 dark:bg-zinc-900"
                  value={example}
                  maxLength={2000}
                  rows={3}
                  onChange={(e) => setExample(e.target.value)}
                  placeholder="Exemple de formulation ou de type de raisonnement attendu…"
                />
              </label>
              <p className="text-sm text-zinc-500">
                Le texte du chapitre et l’exemple seront envoyés à OpenAI. Les
                images ne sont pas transmises. Chaque nouvelle demande peut
                entraîner un coût pour l’exploitant, même si elle échoue. Les
                réponses et explications générées peuvent contenir des erreurs :
                vérifiez-les dans le cours.
              </p>
              <p className="text-sm">
                <Link
                  className="text-indigo-600 underline"
                  to="/confidentialite"
                >
                  Confidentialité et utilisation de l’IA
                </Link>
              </p>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                J’accepte l’envoi du texte du chapitre et de mon exemple à
                OpenAI pour cette demande.
              </label>
            </fieldset>
            <p className="text-xs text-zinc-500">
              Le chapitre doit contenir entre 80 et{' '}
              {config.data.max_source_chars.toLocaleString('fr-FR')} caractères.
              Aucun contenu n’est tronqué automatiquement.
            </p>
            <button
              className={button}
              type="submit"
              disabled={
                generate.isPending ||
                !consent ||
                !config.data.enabled ||
                (!request && config.data.remaining_today === 0)
              }
            >
              {generate.isPending
                ? 'Génération en cours…'
                : request
                  ? 'Renvoyer la même demande'
                  : 'Générer cinq questions'}
            </button>
            {generate.isPending && (
              <p role="status">
                Cela peut prendre jusqu’à 45 secondes. Votre demande reste
                enregistrée si vous quittez cette page.
              </p>
            )}
            {generate.error && (
              <ErrorMessage message={generate.error.message} />
            )}
            {request && !generate.isPending && (
              <div className="flex flex-wrap gap-3">
                <Link
                  className="text-sm text-indigo-600 underline"
                  to={`/qcm/${request.id}`}
                >
                  Vérifier cette demande
                </Link>
                <button
                  type="button"
                  className={button}
                  onClick={() => {
                    setRequest(null)
                    setConsent(false)
                    generate.reset()
                  }}
                >
                  Préparer une nouvelle demande (coût possible)
                </button>
              </div>
            )}
          </form>
        </>
      )}
      <section>
        <h2 className="mb-3 text-lg font-medium">
          Dernières demandes de ce chapitre
        </h2>
        {list.isPending && <p role="status">Chargement des QCM…</p>}
        {list.error && (
          <ErrorMessage
            message={list.error.message}
            onRetry={() => void list.refetch()}
          />
        )}
        {list.data?.length === 0 && <p>Aucun QCM pour ce chapitre.</p>}
        <ul className="space-y-3">
          {list.data?.map((q) => (
            <li
              key={q.id}
              className="rounded-lg border p-3 dark:border-zinc-800"
            >
              <Link className="text-indigo-600 underline" to={`/qcm/${q.id}`}>
                {q.chapter_title} — {DIFFICULTY_LABELS[q.difficulty]}
              </Link>
              <p className="text-sm">
                {new Date(q.created_at).toLocaleString('fr-FR')} ·{' '}
                {q.status === 'ready'
                  ? 'Disponible'
                  : q.status === 'failed'
                    ? 'Échec de génération'
                    : 'En cours'}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
