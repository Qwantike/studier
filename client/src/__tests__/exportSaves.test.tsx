import React, { useEffect } from 'react'
import { create, act, type ReactTestRenderer } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import {
  flushForExport,
  useChapterSaver,
  registerChapterSnapshot,
} from '../hooks/useChapterSaver'

vi.mock('../api/client', () => ({ api: vi.fn().mockResolvedValue(undefined) }))
let renderer: ReactTestRenderer
let saver: ReturnType<typeof useChapterSaver>
function Harness() {
  const current = useChapterSaver('chapter-1')
  useEffect(() => {
    saver = current
  }, [current])
  return null
}
beforeEach(async () => {
  vi.useFakeTimers()
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  vi.mocked(api).mockResolvedValue(undefined)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={qc}>
        <Harness />
      </QueryClientProvider>,
    )
  })
})
afterEach(async () => {
  vi.mocked(api).mockResolvedValue(undefined)
  await act(async () => {
    await flushForExport()
    renderer.unmount()
  })
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
it('envoie les dernières frappes sans attendre le délai de sauvegarde', async () => {
  act(() => {
    saver.queue({ content_md: 'Dernière frappe' })
  })
  expect(api).not.toHaveBeenCalled()
  await act(async () => {
    await flushForExport('chapter-1')
  })
  expect(api).toHaveBeenCalledWith('/chapters/chapter-1', {
    method: 'PATCH',
    body: JSON.stringify({ content_md: 'Dernière frappe' }),
  })
  expect(saver.state).toBe('saved')
})
it("l'export global envoie aussi les modifications de l'éditeur ouvert", async () => {
  act(() => {
    saver.queue({ title: 'Nouveau titre' })
  })
  await act(async () => {
    await flushForExport()
  })
  expect(api).toHaveBeenCalledTimes(1)
  expect(saver.state).toBe('saved')
})
it("bloque l'export si les dernières modifications n'ont pas été sauvegardées", async () => {
  vi.mocked(api).mockRejectedValue(new Error('Hors ligne'))
  act(() => {
    saver.queue({ content_md: 'À conserver' })
  })
  await act(async () => {
    await expect(flushForExport('chapter-1')).rejects.toThrow(
      'Sauvegarde impossible',
    )
  })
  expect(saver.state).toBe('error')
  vi.mocked(api).mockResolvedValue(undefined)
  await act(async () => {
    await flushForExport('chapter-1')
  })
  expect(saver.state).toBe('saved')
})
it('attend une sauvegarde déjà lancée avant de terminer', async () => {
  let finish!: () => void
  vi.mocked(api).mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve
    }),
  )
  act(() => {
    saver.queue({ content_md: 'En cours' })
  })
  let finished = false
  let pending!: Promise<void>
  await act(async () => {
    pending = flushForExport('chapter-1').then(() => {
      finished = true
    })
  })
  expect(finished).toBe(false)
  await act(async () => {
    finish()
    await pending
  })
  expect(finished).toBe(true)
})
it('réessaie automatiquement trois secondes après un échec', async () => {
  vi.mocked(api).mockRejectedValueOnce(new Error('Hors ligne'))
  act(() => saver.queue({ content_md: 'À conserver' }))
  await act(async () => {
    await saver.flush()
  })
  expect(saver.state).toBe('error')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2999)
  })
  expect(api).toHaveBeenCalledTimes(1)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(api).toHaveBeenCalledTimes(2)
  expect(saver.state).toBe('saved')
})
it('une reprise après échec conserve la saisie arrivée pendant la requête', async () => {
  let fail!: (error: Error) => void
  vi.mocked(api).mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject
      }),
  )
  act(() => saver.queue({ title: 'Titre', content_md: 'Ancien texte' }))
  let first!: Promise<void>
  await act(async () => {
    first = saver.flush()
  })
  act(() => saver.queue({ content_md: 'Dernière frappe' }))
  await act(async () => {
    fail(new Error('Hors ligne'))
    await first
  })
  await act(async () => {
    await saver.flush()
  })
  const sent = JSON.parse(vi.mocked(api).mock.calls[1]![1]!.body as string)
  expect(sent).toEqual({ title: 'Titre', content_md: 'Dernière frappe' })
  expect(saver.state).toBe('saved')
})

it('capture les frappes encore différées par Milkdown avant la sauvegarde', async () => {
  const unregister = registerChapterSnapshot('chapter-1', () =>
    saver.queue({ content_md: 'Encore dans l’éditeur' }),
  )
  try {
    await act(async () => {
      await flushForExport('chapter-1')
    })
    expect(api).toHaveBeenCalledWith('/chapters/chapter-1', {
      method: 'PATCH',
      body: JSON.stringify({ content_md: 'Encore dans l’éditeur' }),
    })
  } finally {
    unregister()
  }
})
it('capture aussi le contenu courant pour une action globale', async () => {
  const unregister = registerChapterSnapshot('chapter-1', () =>
    saver.queue({ content_md: 'Dernière capture globale' }),
  )
  try {
    await act(async () => {
      await flushForExport()
    })
    expect(api).toHaveBeenCalledWith('/chapters/chapter-1', {
      method: 'PATCH',
      body: JSON.stringify({ content_md: 'Dernière capture globale' }),
    })
  } finally {
    unregister()
  }
})
