import { useState, useEffect } from 'react'
import Modal from './Modal'
import { api } from '../api/client'
import { useNavigate } from 'react-router-dom'

export default function AiGenerateModal({ chapterIds, onClose }: { chapterIds: string[], onClose: () => void }) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [jobId, setJobId] = useState<string | null>(null)
    const navigate = useNavigate()

    useEffect(() => {
        if (!jobId) return
        const interval = setInterval(async () => {
            try {
                const job = await api<{ status: string, result?: any, error_message?: string }>(`/ai/jobs/${jobId}`)
                if (job.status === 'done') {
                    clearInterval(interval)
                    navigate(`/ai-evaluations/${job.result.evaluation_id}`)
                } else if (job.status === 'error') {
                    clearInterval(interval)
                    setError(job.error_message || 'Erreur lors de la génération')
                    setJobId(null) // <-- AJOUT IMPORTANT
                    setBusy(false)
                }
            } catch (err: any) {
                clearInterval(interval)
                setError(err.message)
                setJobId(null) // <-- AJOUT IMPORTANT
                setBusy(false)
            }
        }, 2000)
        return () => clearInterval(interval)
    }, [jobId, navigate])

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setBusy(true); setError(null)
        try {
            const res = await api<{ job_id: string }>('/ai/generate', {
                method: 'POST',
                body: JSON.stringify({ chapter_ids: chapterIds, difficulty: 'moyen', questionCount: 5, types: ['qcm'] })
            })
            setJobId(res.job_id)
        } catch (err: any) {
            setError(err.message)
            setBusy(false)
        }
    }

    return (
        <Modal title="Générer une évaluation par IA" onClose={onClose}>
            {jobId ? (
                <div className="text-center py-10 space-y-4">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
                    <p className="text-sm text-zinc-500">L'IA rédige l'évaluation, cela peut prendre jusqu'à une minute...</p>
                </div>
            ) : (
                <form onSubmit={onSubmit} className="space-y-4">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Cette action va envoyer le contenu Markdown de vos chapitres à votre fournisseur d'IA configuré pour générer un QCM ciblé.</p>
                    {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 rounded-lg dark:hover:bg-zinc-800">Annuler</button>
                        <button type="submit" disabled={busy} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">Lancer la génération</button>
                    </div>
                </form>
            )}
        </Modal>
    )
}