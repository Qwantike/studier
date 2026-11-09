import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { flushForExport } from '../hooks/useChapterSaver'
import ChapterQuizzesPage from '../pages/ChapterQuizzesPage'
import { QuizPlayer } from '../pages/QuizPage'
import type { QuizDetail } from '../../../shared/quizzes'
vi.mock('../api/client', () => ({ api: vi.fn() }))
vi.mock('../hooks/useChapterSaver', () => ({
  flushForExport: vi.fn().mockResolvedValue(undefined),
}))
let renderer: ReactTestRenderer, cache: QueryClient
const config = {
  enabled: true,
  daily_limit: 5,
  remaining_today: 5,
  provider: 'OpenAI',
  max_source_chars: 20000,
}
const quiz: QuizDetail = {
  id: 'quiz',
  chapter_id: 'chapter',
  chapter_title: 'Matrices',
  difficulty: 'medium',
  status: 'ready',
  created_at: '2026-11-09T12:00:00Z',
  attempts: [],
  questions: Array.from({ length: 5 }, (_, i) => ({
    id: `q${i}`,
    position: i,
    prompt: `Question ${i}`,
    options: ['A', 'B', 'C', 'D'],
  })),
}
async function mount(page: React.ReactNode, enabled = true) {
  cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
  cache.setQueryData(['quiz-config'], { ...config, enabled })
  cache.setQueryData(['quizzes', 'chapter'], [])
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={cache}>
        <MemoryRouter initialEntries={['/chapitres/chapter/qcm']}>
          <Routes>
            <Route path="/chapitres/:id/qcm" element={page} />
            <Route path="/qcm/:id" element={<p>QCM enregistré</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
  })
}
afterEach(async () => {
  await act(async () => renderer?.unmount())
  cache?.clear()
  vi.clearAllMocks()
})
const settle = () => new Promise((resolve) => setTimeout(resolve, 30))
it('désactive la génération tant que l’envoi au tiers n’est pas accepté', async () => {
  await mount(<ChapterQuizzesPage />)
  const submit = renderer.root
    .findAllByType('button')
    .find((b) => b.props.type === 'submit')!
  expect(submit.props.disabled).toBe(true)
  await act(async () =>
    renderer.root
      .findByType('input')
      .props.onChange({ target: { checked: true } }),
  )
  expect(
    renderer.root
      .findAllByType('button')
      .find((b) => b.props.type === 'submit')!.props.disabled,
  ).toBe(false)
  expect(JSON.stringify(renderer.toJSON())).toContain('OpenAI')
})
it('conserve le même identifiant de génération lors d’une reprise après une erreur réseau', async () => {
  vi.mocked(api).mockImplementation(async (path, init) => {
    if (init?.method === 'POST') throw new Error('Réseau indisponible')
    return path === '/quizzes/config' ? config : []
  })
  await mount(<ChapterQuizzesPage />)
  await act(async () =>
    renderer.root
      .findByType('input')
      .props.onChange({ target: { checked: true } }),
  )
  for (let i = 0; i < 2; i++)
    await act(async () => {
      renderer.root
        .findByType('form')
        .props.onSubmit({ preventDefault: vi.fn() })
      await settle()
    })
  const posts = vi
    .mocked(api)
    .mock.calls.filter(([, init]) => init?.method === 'POST')
  expect(posts).toHaveLength(2)
  expect(posts[0]![1]!.body).toBe(posts[1]![1]!.body)
  expect(JSON.parse(String(posts[0]![1]!.body))).toMatchObject({
    consent: true,
    difficulty: 'medium',
  })
  expect(flushForExport).toHaveBeenCalledWith('chapter')
  expect(renderer.root.findAllByProps({ role: 'alert' })).toHaveLength(1)
})
it('garde l’historique disponible quand la génération est désactivée', async () => {
  await mount(<ChapterQuizzesPage />, false)
  expect(
    renderer.root
      .findAllByType('button')
      .find((b) => b.props.type === 'submit')!.props.disabled,
  ).toBe(true)
  expect(JSON.stringify(renderer.toJSON())).toContain(
    'Vos QCM enregistrés restent accessibles.',
  )
})
it('n’affiche le score et le corrigé qu’après soumission et réutilise le QCM sans génération', async () => {
  const correction = {
    id: 'attempt',
    score: 5,
    total: 5,
    created_at: '2026-11-09',
    questions: quiz.questions.map((q) => ({
      ...q,
      correct_index: 0,
      selected_index: 0,
      explanation: 'Explication du cours',
    })),
  }
  vi.mocked(api).mockResolvedValue(correction)
  await mount(<QuizPlayer quiz={quiz} />)
  expect(JSON.stringify(renderer.toJSON())).not.toContain(
    'Explication du cours',
  )
  for (let i = 0; i < 5; i++)
    await act(async () =>
      renderer.root.findAllByType('input')[i * 4]!.props.onChange(),
    )
  await act(async () => {
    renderer.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() })
    await settle()
  })
  expect(JSON.stringify(renderer.toJSON())).toContain('Explication du cours')
  expect(renderer.root.findByProps({ 'aria-label': 'Corrigé' })).toBeTruthy()
  expect(api).toHaveBeenCalledWith(
    '/quizzes/quiz/attempts',
    expect.objectContaining({ method: 'POST' }),
  )
  const restart = renderer.root
    .findAllByType('button')
    .find((b) => String(b.props.children).includes('Recommencer'))!
  await act(async () => restart.props.onClick())
  expect(renderer.root.findAllByType('input')).toHaveLength(20)
  expect(JSON.stringify(renderer.toJSON())).not.toContain(
    'Explication du cours',
  )
  expect(
    vi.mocked(api).mock.calls.filter(([path]) => path.includes('/chapters/')),
  ).toHaveLength(0)
})
it('rend les textes du modèle comme du texte échappé, jamais comme du HTML', () => {
  const malicious = {
    ...quiz,
    questions: quiz.questions.map((q) => ({
      ...q,
      prompt: '<img src=x onerror=alert(1)>',
      options: ['<script>alert(1)</script>', 'B', 'C', 'D'],
    })),
  }
  const qc = new QueryClient()
  const html = renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <QuizPlayer quiz={malicious} />
    </QueryClientProvider>,
  )
  expect(html).toContain('&lt;img')
  expect(html).toContain('&lt;script&gt;')
  expect(html).not.toContain('<img')
  expect(html).not.toContain('<script>')
  qc.clear()
})
