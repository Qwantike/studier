import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import StudyDashboard from '../components/StudyDashboard'
import { api } from '../api/client'
vi.mock('../api/client', () => ({ api: vi.fn() }))
vi.mock('../hooks/useReviews', () => ({ reviewTimezone: () => 'UTC' }))
let renderer: ReactTestRenderer
let cache: QueryClient
const preferences = { enabled: false, weekly_days: 3 }
const enabled = {
  preferences: { enabled: true, weekly_days: 3 },
  today: '2026-11-09',
  week_start: '2026-11-09',
  weekly_days: 0,
  current_streak: 0,
  best_streak: 0,
  total_reviews: 0,
  badges: [],
  subjects: [],
  recent: [],
}
async function mount(data: object) {
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  cache.setQueryData(['study', 'UTC'], data)
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={cache}>
        <MemoryRouter>
          <StudyDashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  })
}
afterEach(async () => {
  await act(async () => renderer?.unmount())
  cache?.clear()
  vi.resetAllMocks()
})
it('ne rend aucune statistique avant activation', async () => {
  await mount({ preferences })
  expect(renderer.root.findAllByType('progress')).toHaveLength(0)
  expect(renderer.root.findAllByType('select')).toHaveLength(0)
  expect(JSON.stringify(renderer.toJSON())).toContain('Afficher mon parcours')
})
it('rend les états vides et un objectif accessible', async () => {
  await mount(enabled)
  expect(
    renderer.root.findByProps({ 'aria-label': 'Objectif hebdomadaire' }).props,
  ).toMatchObject({ value: 0, max: 3 })
  expect(JSON.stringify(renderer.toJSON())).toContain(
    'Votre premier rappel apparaîtra ici.',
  )
  expect(JSON.stringify(renderer.toJSON())).toContain(
    'Ajoutez une matière pour commencer.',
  )
})
it('enregistre le masquage et retire immédiatement les statistiques', async () => {
  vi.mocked(api).mockImplementation(async (path, init) =>
    init?.method === 'PATCH' ? preferences : { preferences },
  )
  await mount(enabled)
  await act(async () => {
    renderer.root.findByType('button').props.onClick()
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  expect(api).toHaveBeenCalledWith(
    '/study/preferences',
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ enabled: false }),
    }),
  )
  expect(renderer.root.findAllByType('progress')).toHaveLength(0)
})
it('affiche une erreur de sauvegarde sans masquer un état non enregistré', async () => {
  vi.mocked(api).mockRejectedValue(new Error('Enregistrement impossible'))
  await mount(enabled)
  await act(async () => {
    renderer.root.findByType('button').props.onClick()
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  expect(renderer.root.findByProps({ role: 'alert' })).toBeTruthy()
  expect(renderer.root.findAllByType('progress')).toHaveLength(1)
})
