import { localDay, shiftDay } from './reviewModel.js'
export interface StudyPreferences {
  enabled: boolean
  weekly_days: number
}
export interface StudySubject {
  id: string
  name: string
  total: number
  revised: number
  reviewed: number
}
export interface StudyDashboard {
  preferences: StudyPreferences
  today: string
  week_start: string
  weekly_days: number
  current_streak: number
  best_streak: number
  total_reviews: number
  badges: { id: string; label: string; earned: boolean }[]
  subjects: StudySubject[]
  recent: {
    id: string
    chapter_id: string
    title: string
    subject_name: string
    occurred_at: string
  }[]
}
/** Dates locales distinctes : plusieurs rappels le même jour ne gonflent pas les séries. */
export function summarizeStudy(
  days: string[],
  total: number,
  now: Date,
  timezone: string,
) {
  const today = localDay(now, timezone)
  const ordered = [...new Set(days)].filter((day) => day <= today).sort()
  const set = new Set(ordered)
  const weekday = new Date(today + 'T12:00:00Z').getUTCDay()
  const week_start = shiftDay(today, -((weekday + 6) % 7))
  let current_streak = 0,
    best_streak = 0,
    run = 0,
    previous = ''
  for (const day of ordered) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1
    best_streak = Math.max(best_streak, run)
    previous = day
  }
  // La journée en cours peut encore être étudiée : une série d'hier reste active.
  let cursor = set.has(today) ? today : shiftDay(today, -1)
  while (set.has(cursor)) {
    current_streak++
    cursor = shiftDay(cursor, -1)
  }
  return {
    today,
    week_start,
    current_streak,
    best_streak,
    weekly_days: ordered.filter((day) => day >= week_start).length,
    total_reviews: total,
    badges: [
      { id: 'first', label: 'Premier rappel', earned: total >= 1 },
      { id: 'three', label: 'Trois jours de suite', earned: best_streak >= 3 },
      { id: 'seven', label: 'Sept jours de suite', earned: best_streak >= 7 },
      { id: 'fifty', label: 'Cinquante rappels', earned: total >= 50 },
    ],
  }
}
