import { useRef, useState } from 'react'
import {
  REVIEW_RATINGS,
  REVIEW_LABELS,
  type ReviewRating,
} from '../../../shared/reviewModel'
import type { ChapterStatus } from '../api/types'
import { useRecordReview } from '../hooks/useReviews'
export default function ReviewButtons({
  chapterId,
  onRecorded,
}: {
  chapterId: string
  onRecorded?: (status: ChapterStatus) => void
}) {
  const record = useRecordReview(),
    request = useRef<{ id: string; rating: ReviewRating } | null>(null)
  const [done, setDone] = useState(false)
  const submit = async (rating: ReviewRating) => {
    if (record.isPending) return
    if (request.current?.rating !== rating)
      request.current = { id: crypto.randomUUID(), rating }
    setDone(false)
    try {
      const result = await record.mutateAsync({
        chapterId,
        ...request.current!,
      })
      request.current = null
      setDone(true)
      onRecorded?.(result.status)
    } catch {
      /* L'erreur reste affichée ; un nouvel essai du même choix réutilise son identifiant. */
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">
        Après avoir essayé de restituer le chapitre sans vos notes :
      </p>
      <div
        className="flex flex-wrap gap-2"
        aria-label="Auto-évaluation de la révision"
      >
        {REVIEW_RATINGS.map((rating) => (
          <button
            key={rating}
            type="button"
            disabled={record.isPending}
            onClick={() => void submit(rating)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-indigo-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-indigo-950"
          >
            {REVIEW_LABELS[rating]}
          </button>
        ))}
      </div>
      {record.isPending && (
        <p role="status" className="text-xs text-zinc-500">
          Enregistrement…
        </p>
      )}
      {done && (
        <p
          role="status"
          className="text-xs text-emerald-700 dark:text-emerald-400"
        >
          Révision enregistrée.
        </p>
      )}
      {record.error && (
        <p role="alert" className="text-sm text-red-600">
          {record.error.message}
        </p>
      )}
    </div>
  )
}
