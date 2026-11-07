/** Modèle heuristique v1, sans calibration individuelle. Toutes les durées sont en jours de 24 h. */
export const REVIEW_MODEL = {
  version: 1,
  target: 0.8,
  maxStability: 3650,
  initial: { seen: 2, understood: 5, revised: 10 },
  first_review: { hard: 2, good: 5, easy: 8 },
  growth: { hard: 1.2, good: 2, easy: 2.5 },
  failure_stability: 1,
} as const
export const REVIEW_RATINGS = ['again', 'hard', 'good', 'easy'] as const
export type ReviewRating = (typeof REVIEW_RATINGS)[number]
export const REVIEW_LABELS: Record<ReviewRating, string> = {
  again: 'À revoir',
  hard: 'Difficile',
  good: 'Réussi',
  easy: 'Facile',
}
export const DAY_MS = 86_400_000
export function retention(elapsedDays: number, stability: number): number {
  if (
    !Number.isFinite(elapsedDays) ||
    !Number.isFinite(stability) ||
    stability <= 0
  )
    throw new Error('Paramètres de rétention invalides')
  return Math.exp(-Math.max(0, elapsedDays) / stability)
}
export const reviewInterval = (stability: number) =>
  -stability * Math.log(REVIEW_MODEL.target)
export function nextStability(
  previous: number | null,
  elapsedDays: number,
  rating: ReviewRating,
): number {
  if (rating === 'again') return REVIEW_MODEL.failure_stability
  if (previous === null) return REVIEW_MODEL.first_review[rating]
  // Répéter immédiatement ne multiplie pas artificiellement la stabilité.
  const spacing = Math.max(
    0,
    Math.min(1, elapsedDays / reviewInterval(previous)),
  )
  const factor = REVIEW_MODEL.growth[rating]
  return Math.min(
    REVIEW_MODEL.maxStability,
    Math.max(1, previous * (1 + (factor - 1) * spacing)),
  )
}
const dayFormatters = new Map<string, Intl.DateTimeFormat>()
export function localDay(instant: Date | string, timezone: string): string {
  let formatter = dayFormatters.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    if (dayFormatters.size >= 32)
      dayFormatters.delete(dayFormatters.keys().next().value!)
    dayFormatters.set(timezone, formatter)
  }
  const parts = formatter.formatToParts(new Date(instant))
  const get = (type: string) => parts.find((part) => part.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export function shiftDay(day: string, delta: number): string {
  const d = new Date(day + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}
export interface MemoryInput {
  status: string
  review_started_at: string | null
  initial_stability_days: number | null
  last_reviewed_at: string | null
  stability_days: number | null
  review_count: number
  evaluation_date: string | null
}
export function estimateMemory(row: MemoryInput, now: Date, timezone: string) {
  const anchor = row.last_reviewed_at ?? row.review_started_at
  const stability = row.stability_days ?? row.initial_stability_days
  const active = row.status !== 'not_started'
  const unknownStart = anchor === null || stability === null
  const elapsed = anchor
    ? Math.max(0, (now.getTime() - new Date(anchor).getTime()) / DAY_MS)
    : 0
  const modelDue =
    anchor && stability
      ? new Date(
          new Date(anchor).getTime() + reviewInterval(stability) * DAY_MS,
        ).toISOString()
      : null
  const today = localDay(now, timezone)
  const lastDay = anchor ? localDay(anchor, timezone) : null
  const examDay = row.evaluation_date ? shiftDay(row.evaluation_date, -1) : null
  // Un rappel la veille, puis le jour J si aucune révision ce jour-là.
  const examTarget =
    examDay && row.evaluation_date
      ? today >= row.evaluation_date
        ? row.evaluation_date
        : examDay
      : null
  const examDue =
    active &&
    examTarget !== null &&
    (row.review_count === 0 || !lastDay || lastDay < examTarget)
  const modelDay = modelDue ? localDay(modelDue, timezone) : null
  const examAdvanced = Boolean(examDue && modelDay && examTarget! < modelDay)
  const dueDay = active
    ? unknownStart
      ? today
      : examAdvanced
        ? examTarget
        : modelDay
    : null
  return {
    active,
    anchor_at: anchor,
    stability_days: stability,
    retention: anchor && stability ? retention(elapsed, stability) : null,
    model_due_at: modelDue,
    due_day: dueDay,
    exam_advanced: examAdvanced,
    due_today: Boolean(dueDay && dueDay <= today),
    due_now: Boolean(
      active &&
      (unknownStart ||
        (examAdvanced ? dueDay! <= today : modelDue! <= now.toISOString())),
    ),
    review_count: row.review_count,
  }
}
