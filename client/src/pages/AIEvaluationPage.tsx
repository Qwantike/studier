import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react'
import { api } from '../api/client'

// Typage basé sur le prompt système qu'on a fourni à l'IA
interface AiQuestion {
    id: string
    type: 'qcm' | 'open'
    prompt: string
    choices?: string[]
    correct_index?: number
    answer_md: string
    points: number
    chapter_title: string
}

interface AiEvalData {
    id: string
    title: string
    created_at: string
    content: {
        title: string
        questions: AiQuestion[]
        total_points: number
    }
}

export default function AIEvaluationPage() {
    const { id } = useParams()
    const { data, isLoading, error } = useQuery({
        queryKey: ['ai-evaluation', id],
        queryFn: () => api<AiEvalData>(`/ai/evaluations/${id}`),
        enabled: !!id
    })

    const [answers, setAnswers] = useState<Record<string, number | string>>({})
    const [showCorrection, setShowCorrection] = useState(false)

    if (isLoading) return <p className="p-6 sm:p-10 text-sm text-zinc-500">Chargement de l'évaluation...</p>
    if (error || !data) return <p className="p-6 text-sm text-red-500">Erreur : Impossible de charger l'évaluation.</p>

    const { questions, total_points } = data.content

    // Calcul du score (seulement sur les QCM)
    const score = questions.reduce((acc, q) => {
        if (q.type === 'qcm' && answers[q.id] === q.correct_index) return acc + q.points
        return acc
    }, 0)

    return (
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
            <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                <ArrowLeft size={15} /> Retour
            </Link>

            <div className="mb-8">
                <h1 className="text-2xl font-semibold tracking-tight">{data.content.title}</h1>
                <p className="mt-2 text-sm text-zinc-500">Généré par l'IA • {questions.length} questions • {total_points} points</p>
            </div>

            <div className="space-y-8">
                {questions.map((q, index) => {
                    const isQcm = q.type === 'qcm'
                    const userAnswer = answers[q.id]
                    const isCorrect = isQcm && userAnswer === q.correct_index

                    return (
                        <div key={q.id} className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
                            <div className="mb-4 flex items-start justify-between gap-4">
                                <h3 className="text-base font-medium">
                                    <span className="mr-2 text-zinc-400">{index + 1}.</span>
                                    {q.prompt}
                                </h3>
                                <span className="shrink-0 rounded bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                                    {q.points} pt{q.points > 1 ? 's' : ''}
                                </span>
                            </div>

                            <p className="mb-4 text-xs text-zinc-500">Source : {q.chapter_title}</p>

                            {isQcm ? (
                                <div className="space-y-2">
                                    {q.choices?.map((choice, cIndex) => {
                                        let btnClass = "w-full text-left rounded-lg border p-3 text-sm transition-colors "

                                        if (showCorrection) {
                                            if (cIndex === q.correct_index) btnClass += "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-300"
                                            else if (userAnswer === cIndex) btnClass += "border-red-500 bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-300"
                                            else btnClass += "border-zinc-200 bg-zinc-50 opacity-50 dark:border-zinc-800 dark:bg-zinc-900/50"
                                        } else {
                                            btnClass += userAnswer === cIndex
                                                ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 dark:bg-indigo-900/20 dark:text-indigo-300"
                                                : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                                        }

                                        return (
                                            <button
                                                key={cIndex}
                                                disabled={showCorrection}
                                                onClick={() => setAnswers(prev => ({ ...prev, [q.id]: cIndex }))}
                                                className={btnClass}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span>{choice}</span>
                                                    {showCorrection && cIndex === q.correct_index && <CheckCircle2 size={18} className="text-emerald-500" />}
                                                    {showCorrection && cIndex !== q.correct_index && userAnswer === cIndex && <XCircle size={18} className="text-red-500" />}
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                            ) : (
                                <textarea
                                    disabled={showCorrection}
                                    rows={4}
                                    className="w-full rounded-lg border border-zinc-300 bg-transparent p-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60 dark:border-zinc-700"
                                    placeholder="Votre réponse..."
                                    onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                />
                            )}

                            {/* Correction affichée après validation */}
                            {showCorrection && (
                                <div className={`mt-5 rounded-lg p-4 text-sm ${isQcm ? (isCorrect ? 'bg-emerald-50 dark:bg-emerald-900/10' : 'bg-red-50 dark:bg-red-900/10') : 'bg-blue-50 dark:bg-blue-900/10'}`}>
                                    <p className="font-semibold mb-1">{isQcm ? (isCorrect ? 'Bonne réponse !' : 'Mauvaise réponse') : 'Éléments de correction :'}</p>
                                    <p className="text-zinc-700 dark:text-zinc-300">{q.answer_md}</p>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            <div className="sticky bottom-6 mt-10 rounded-2xl border border-zinc-200 bg-white/90 p-5 text-center shadow-lg backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
                {!showCorrection ? (
                    <button
                        onClick={() => setShowCorrection(true)}
                        className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
                    >
                        Valider mes réponses
                    </button>
                ) : (
                    <div className="flex flex-col items-center gap-2">
                        <p className="text-lg font-semibold">
                            Score automatique (QCM) : <span className="text-indigo-600 dark:text-indigo-400">{score}</span>
                        </p>
                        <p className="text-xs text-zinc-500">Les questions ouvertes doivent être auto-évaluées en lisant la correction.</p>
                    </div>
                )}
            </div>
        </main>
    )
}