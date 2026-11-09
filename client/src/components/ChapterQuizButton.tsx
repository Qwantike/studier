import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { flushForExport } from '../hooks/useChapterSaver'
export default function ChapterQuizButton({
  chapterId,
}: {
  chapterId: string
}) {
  const navigate = useNavigate(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  async function open() {
    setBusy(true)
    setError('')
    try {
      await flushForExport(chapterId)
      navigate(`/chapitres/${chapterId}/qcm`)
    } catch {
      setError('Sauvegardez le chapitre avant de préparer un QCM.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <button
        disabled={busy}
        onClick={() => void open()}
        className="rounded-lg border bg-white px-2 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
      >
        QCM d’entraînement
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
