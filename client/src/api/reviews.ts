import type { ChapterStatus } from './types'
import type { estimateMemory, ReviewRating } from '../../../shared/reviewModel'
export type Memory = ReturnType<typeof estimateMemory>
export interface ReviewItem {
  id: string
  title: string
  status: ChapterStatus
  subject_id: string
  subject_name: string
  subject_color: string
  year_label: string
  semester_label: string
  review_started_at: string | null
  initial_stability_days: number | null
  evaluation_id: string | null
  evaluation_title: string | null
  evaluation_date: string | null
  memory: Memory
}
export interface Review {
  id: string
  reviewed_at: string
  rating: ReviewRating
  stability_days: number
  ordinal: number
  model_version: number
}
export interface ReviewDetail {
  chapter: ReviewItem
  history: Review[]
  computed_at: string
  timezone: string
}
export interface ReviewQueue {
  items: ReviewItem[]
  total: number
  counts: { today: number; now: number; unstarted: number }
  computed_at: string
  today: string
  timezone: string
}
export interface QueueParams {
  scope?: 'today' | 'all'
  evaluation_id?: string
  subject_id?: string
  offset?: number
  limit?: number
}
