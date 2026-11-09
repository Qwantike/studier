import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import ErrorMessage from '../components/ErrorMessage'
import type { QuizCorrection, QuizDetail } from '../../../shared/quizzes'
const button =
  'rounded-lg border px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700'
export default function QuizPage() {
  const { id } = useParams()
  const query = useQuery({
    queryKey: ['quiz', id],
    queryFn: () => api<QuizDetail>(`/quizzes/${id}`),
    refetchInterval: (q) =>
      q.state.data?.status === 'generating' ? 3000 : false,
  })
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold">QCM d’entraînement</h1>
      {query.isPending && <p role="status">Chargement…</p>}
      {query.error && (
        <ErrorMessage
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data && (
        <>
          <Link
            className="text-indigo-600 underline"
            to={`/chapitres/${query.data.chapter_id}/qcm`}
          >
            QCM de {query.data.chapter_title}
          </Link>
          <p className="text-sm text-zinc-500">
            Ce QCM correspond au chapitre au moment de sa génération. La
            correction automatique compare vos choix au corrigé généré, dont
            l’exactitude doit être vérifiée dans le cours.
          </p>
          {query.data.status === 'generating' && (
            <p role="status">
              Génération en cours… Vous pouvez revenir sur cette page plus tard.
            </p>
          )}
          {query.data.status === 'failed' && (
            <p role="alert">
              Cette génération a échoué ou a expiré. Elle ne sera pas relancée
              automatiquement. Une nouvelle demande nécessite une nouvelle
              confirmation et peut entraîner un coût.
            </p>
          )}
          {query.data.status === 'ready' && (
            <QuizPlayer key={query.data.id} quiz={query.data} />
          )}
        </>
      )}
    </main>
  )
}
export function QuizPlayer({ quiz }: { quiz: QuizDetail }) {
  const cache = useQueryClient()
  const [answers, setAnswers] = useState<Record<string, number>>({}),
    [result, setResult] = useState<QuizCorrection | null>(null)
  const [submission, setSubmission] = useState<{
    id: string
    answers: Record<string, number>
  } | null>(null)
  const correction = useMutation({
    mutationFn: (id: string) => api<QuizCorrection>(`/quiz-attempts/${id}`),
    onSuccess: setResult,
  })
  const submit = useMutation({
    retry: false,
    mutationFn: (body: { id: string; answers: Record<string, number> }) =>
      api<QuizCorrection>(`/quizzes/${quiz.id}/attempts`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      setResult(data)
      void cache.invalidateQueries({ queryKey: ['quiz', quiz.id] })
    },
  })
  function finish(e: FormEvent) {
    e.preventDefault()
    const body = submission ?? {
      id: crypto.randomUUID(),
      answers: { ...answers },
    }
    setSubmission(body)
    submit.mutate(body)
  }
  return (
    <div className="space-y-6">
      {!result && (
        <form className="space-y-5" onSubmit={finish}>
          {quiz.questions.map((q, i) => (
            <fieldset
              key={q.id}
              disabled={!!submission}
              className="space-y-2 rounded-xl border p-4 dark:border-zinc-800"
            >
              <legend className="px-1 font-medium">
                {i + 1}. {q.prompt}
              </legend>
              {q.options.map((option, index) => (
                <label className="flex items-start gap-3 py-1" key={index}>
                  <input
                    type="radio"
                    name={q.id}
                    value={index}
                    checked={answers[q.id] === index}
                    required
                    onChange={() => setAnswers({ ...answers, [q.id]: index })}
                  />
                  <span className="whitespace-pre-wrap">{option}</span>
                </label>
              ))}
            </fieldset>
          ))}
          <button
            className={button}
            type="submit"
            disabled={
              submit.isPending ||
              Object.keys(answers).length !== quiz.questions.length
            }
          >
            {submit.isPending
              ? 'Correction…'
              : submission
                ? 'Renvoyer les mêmes réponses'
                : 'Corriger mes réponses'}
          </button>
          {submit.error && <ErrorMessage message={submit.error.message} />}
        </form>
      )}
      {result && (
        <section aria-label="Corrigé" className="space-y-5">
          <h2 className="text-xl font-semibold">
            Score : {result.score} / {result.total} (
            {Math.round((100 * result.score) / result.total)} %)
          </h2>
          {result.questions.map((q, i) => (
            <article
              className="rounded-xl border p-4 dark:border-zinc-800"
              key={q.id}
            >
              <h3 className="font-medium">
                {i + 1}. {q.prompt}
              </h3>
              <p className="mt-2">
                Votre réponse : {q.options[q.selected_index]} —{' '}
                {q.selected_index === q.correct_index ? 'Correct' : 'À revoir'}
              </p>
              <p>Réponse attendue : {q.options[q.correct_index]}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {q.explanation}
              </p>
            </article>
          ))}
          <button
            className={button}
            onClick={() => {
              setResult(null)
              setAnswers({})
              setSubmission(null)
              submit.reset()
              correction.reset()
            }}
          >
            Recommencer ce QCM sans nouvelle génération
          </button>
        </section>
      )}
      <section>
        <h2 className="font-medium">Dernières tentatives</h2>
        <ul className="mt-2 space-y-2">
          {quiz.attempts.map((a) => (
            <li key={a.id}>
              <button
                className="text-sm text-indigo-600 underline"
                disabled={correction.isPending || submit.isPending}
                onClick={() => correction.mutate(a.id)}
              >
                {a.score} / {a.total} —{' '}
                {new Date(a.created_at).toLocaleString('fr-FR')}
              </button>
            </li>
          ))}
        </ul>
        {quiz.attempts.length === 0 && (
          <p className="text-sm">Aucune tentative enregistrée.</p>
        )}
        {correction.error && (
          <ErrorMessage message={correction.error.message} />
        )}
      </section>
    </div>
  )
}
