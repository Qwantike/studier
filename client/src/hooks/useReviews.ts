import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { ChapterStatus } from '../api/types'
import type {
  Review,
  ReviewDetail,
  ReviewQueue,
  QueueParams,
} from '../api/reviews'
import type { ReviewRating } from '../../../shared/reviewModel'
import { flushForExport } from './useChapterSaver'
export const reviewTimezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
export function useReviewQueue(params: QueueParams = {}) {
  const timezone = reviewTimezone(),
    qs = new URLSearchParams({ timezone })
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== '') qs.set(key, String(value))
  return useQuery({
    queryKey: ['reviews', 'queue', timezone, params],
    queryFn: () => api<ReviewQueue>('/reviews?' + qs),
    refetchInterval: 60000,
  })
}
export function useChapterReviews(id: string) {
  const timezone = reviewTimezone()
  return useQuery({
    queryKey: ['reviews', 'chapter', id, timezone],
    queryFn: () =>
      api<ReviewDetail>(
        `/chapters/${id}/reviews?timezone=${encodeURIComponent(timezone)}`,
      ),
    refetchInterval: 60000,
  })
}
export function useRecordReview() {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (value: {
      chapterId: string
      rating: ReviewRating
      id: string
    }) => {
      await flushForExport(value.chapterId)
      return api<{ review: Review; status: ChapterStatus }>(
        `/chapters/${value.chapterId}/reviews`,
        {
          method: 'POST',
          body: JSON.stringify({ id: value.id, rating: value.rating }),
        },
      )
    },
    onSuccess: async () => {
      await Promise.all(
        [
          'reviews',
          'chapter',
          'tree',
          'evaluations',
          'evaluation',
          'dashboard',
        ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
      )
    },
  })
}
