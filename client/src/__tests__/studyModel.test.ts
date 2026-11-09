import { expect, it } from 'vitest'
import { summarizeStudy } from '../../../shared/studyActivity'
const summary = (days: string[], at = '2026-11-09T12:00:00Z', tz = 'UTC') =>
  summarizeStudy(days, days.length, new Date(at), tz)
it('distingue les jours des rappels et ne remplit pas les jours de pause', () => {
  expect(summary([])).toMatchObject({
    current_streak: 0,
    best_streak: 0,
    weekly_days: 0,
  })
  expect(
    summary([
      '2026-11-09',
      '2026-11-08',
      '2026-11-08',
      '2026-11-07',
      '2026-11-04',
    ]),
  ).toMatchObject({
    current_streak: 3,
    best_streak: 3,
    weekly_days: 1,
    total_reviews: 5,
  })
  expect(summary(['2026-11-07', '2026-11-08'])).toMatchObject({
    current_streak: 2,
  })
  expect(summary(['2026-11-06', '2026-11-07'])).toMatchObject({
    current_streak: 0,
    best_streak: 2,
  })
})
it('commence la semaine le lundi et ignore les dates futures', () => {
  expect(
    summary(['2026-11-02', '2026-11-08', '2026-11-09'], '2026-11-08T12:00:00Z'),
  ).toMatchObject({
    week_start: '2026-11-02',
    weekly_days: 2,
    current_streak: 1,
  })
})
it('respecte minuit local, le changement d’année et l’heure d’hiver', () => {
  const days = ['2026-11-08', '2026-11-09']
  expect(summary(days, '2026-11-08T23:30:00Z', 'Europe/Paris')).toMatchObject({
    today: '2026-11-09',
    weekly_days: 1,
    current_streak: 2,
  })
  expect(
    summary(days, '2026-11-08T23:30:00Z', 'America/Montreal'),
  ).toMatchObject({ today: '2026-11-08', weekly_days: 1, current_streak: 1 })
  expect(
    summary(['2026-12-31', '2027-01-01'], '2027-01-01T10:00:00Z'),
  ).toMatchObject({ current_streak: 2, week_start: '2026-12-28' })
  expect(
    summary(
      ['2026-10-24', '2026-10-25'],
      '2026-10-25T23:30:00Z',
      'Europe/Paris',
    ),
  ).toMatchObject({ today: '2026-10-26', current_streak: 2 })
})
it('attribue les badges selon les rappels et la meilleure série', () => {
  const result = summarizeStudy(
    ['2026-11-02', '2026-11-03', '2026-11-04'],
    50,
    new Date('2026-11-09T12:00:00Z'),
    'UTC',
  )
  expect(result.badges.map((b) => b.earned)).toEqual([true, true, false, true])
})
