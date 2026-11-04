import { describe, it, expect } from 'vitest'
import {
  retention,
  nextStability,
  reviewInterval,
  estimateMemory,
  localDay,
  shiftDay,
  DAY_MS,
  type MemoryInput,
} from '../../../shared/reviewModel'
const row: MemoryInput = {
  status: 'understood',
  review_started_at: '2026-11-01T12:00:00.000Z',
  initial_stability_days: 5,
  last_reviewed_at: null,
  stability_days: null,
  review_count: 0,
  evaluation_date: null,
}
describe('modèle estimatif des révisions', () => {
  it('suit R=e^-t/S, sans dépasser [0,1]', () => {
    expect(retention(0, 5)).toBe(1)
    expect(retention(5, 5)).toBeCloseTo(Math.exp(-1))
    expect(retention(-1, 5)).toBe(1)
    expect(retention(10000, 1)).toBe(0)
    expect(() => retention(1, 0)).toThrow()
    expect(() => retention(NaN, 1)).toThrow()
  })
  it('calcule le seuil à 80 % et augmente la stabilité pour une restitution réussie espacée', () => {
    expect(retention(reviewInterval(5), 5)).toBeCloseTo(0.8)
    expect(nextStability(5, reviewInterval(5), 'hard')).toBeCloseTo(6)
    expect(nextStability(5, reviewInterval(5), 'good')).toBe(10)
    expect(nextStability(5, reviewInterval(5), 'easy')).toBe(12.5)
    expect(nextStability(5, 0, 'easy')).toBe(5)
    expect(nextStability(3650, 100000, 'easy')).toBe(3650)
    expect(nextStability(100, 20, 'again')).toBe(1)
    expect(nextStability(null, 0, 'good')).toBe(5)
  })
  it('ne démarre pas un chapitre non commencé et garde le suivi en pause', () => {
    expect(
      estimateMemory(
        { ...row, status: 'not_started' },
        new Date('2026-11-04T12:00Z'),
        'UTC',
      ),
    ).toMatchObject({
      active: false,
      due_today: false,
      due_now: false,
      due_day: null,
    })
  })
  it('utilise la dernière révision plutôt que le point de départ', () => {
    const memory = estimateMemory(
      {
        ...row,
        last_reviewed_at: '2026-11-04T10:00:00Z',
        stability_days: 10,
        review_count: 2,
      },
      new Date('2026-11-04T12:00Z'),
      'UTC',
    )
    expect(memory.retention).toBeCloseTo(Math.exp(-2 / 24 / 10))
    expect(memory.due_today).toBe(false)
  })
  it('distingue un rappel plus tard dans la journée et un rappel immédiat', () => {
    const before = estimateMemory(
      {
        ...row,
        review_started_at: '2026-11-04T00:00Z',
        initial_stability_days: 1,
      },
      new Date('2026-11-04T01:00Z'),
      'UTC',
    )
    expect(before.due_today).toBe(true)
    expect(before.due_now).toBe(false)
    expect(
      estimateMemory(
        { ...row, initial_stability_days: 1 },
        new Date('2026-11-04T12:00Z'),
        'UTC',
      ).due_now,
    ).toBe(true)
  })
  it('suit les jours locaux et les changements d’heure sans durées négatives', () => {
    expect(localDay('2026-11-04T00:30Z', 'America/New_York')).toBe('2026-11-03')
    expect(localDay('2026-10-25T01:30Z', 'Europe/Paris')).toBe('2026-10-25')
    expect(shiftDay('2028-03-01', -1)).toBe('2028-02-29')
    const same = estimateMemory(
      { ...row, review_started_at: '2026-11-04T12:00Z' },
      new Date('2026-11-04T11:00Z'),
      'UTC',
    )
    expect(same.retention).toBe(1)
    expect(DAY_MS).toBe(86400000)
  })
  it('avance le rappel pour une évaluation sans modifier R ni S', () => {
    const now = new Date('2026-11-04T12:00Z'),
      input = {
        ...row,
        review_started_at: '2026-11-04T11:00Z',
        initial_stability_days: 100,
      }
    const normal = estimateMemory(input, now, 'UTC'),
      exam = estimateMemory(
        { ...input, evaluation_date: '2026-11-05' },
        now,
        'UTC',
      )
    expect(exam).toMatchObject({
      exam_advanced: true,
      due_today: true,
      due_now: true,
      due_day: '2026-11-04',
    })
    expect(exam.retention).toBe(normal.retention)
    expect(exam.stability_days).toBe(normal.stability_days)
    expect(
      estimateMemory(
        {
          ...input,
          last_reviewed_at: '2026-11-04T11:00Z',
          stability_days: 100,
          review_count: 1,
          evaluation_date: '2026-11-05',
        },
        now,
        'UTC',
      ).exam_advanced,
    ).toBe(false)
    expect(
      estimateMemory(
        {
          ...input,
          last_reviewed_at: '2026-11-04T11:00Z',
          stability_days: 100,
          review_count: 1,
          evaluation_date: '2026-11-05',
        },
        new Date('2026-11-05T01:00Z'),
        'UTC',
      ).exam_advanced,
    ).toBe(true)
  })
})

it('demande une première révision pour un chapitre ancien sans date connue', () => {
  expect(
    estimateMemory(
      { ...row, review_started_at: null, initial_stability_days: null },
      new Date('2026-11-04T12:00Z'),
      'UTC',
    ),
  ).toMatchObject({
    active: true,
    anchor_at: null,
    retention: null,
    due_today: true,
    due_now: true,
    due_day: '2026-11-04',
  })
})
