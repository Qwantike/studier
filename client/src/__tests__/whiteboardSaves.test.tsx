import React, { useEffect } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api/client'
import {
  draftKey,
  flushWhiteboards,
  useWhiteboardSaver,
} from '../hooks/useWhiteboardSaver'
import {
  makeScene,
  sceneBytes,
  type Scene,
  type WhiteboardDetail,
} from '../lib/whiteboardScene'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState } from '@excalidraw/excalidraw/types'

vi.mock('../api/client', () => ({
  api: vi.fn(),
  ApiError: class extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message)
    }
  },
}))
const scene: Scene = {
  type: 'excalidraw',
  version: 2,
  source: 'studier',
  elements: [],
  appState: {},
  files: {},
}
const board = { id: 'b', user_id: 'a', revision: 1, scene } as WhiteboardDetail
let saver: ReturnType<typeof useWhiteboardSaver>, renderer: ReactTestRenderer
const storage = new Map<string, string>()
function Harness() {
  const current = useWhiteboardSaver(board)
  useEffect(() => {
    saver = current
  }, [current])
  return null
}
beforeEach(() => {
  vi.useFakeTimers()
  storage.clear()
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  })
  vi.mocked(api).mockImplementation(async () => ({ revision: 2 }) as never)
})
const mount = async () => {
  await act(async () => {
    renderer = create(<Harness />)
  })
}
afterEach(async () => {
  if (renderer)
    await act(async () => {
      await saver.discard()
      renderer.unmount()
    })
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
it('sauvegarde le JSON après le délai avec la révision attendue', async () => {
  await mount()
  const changed = { ...scene, appState: { viewBackgroundColor: '#ffffff' } }
  act(() => saver.queue(changed))
  expect(api).not.toHaveBeenCalled()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(api).toHaveBeenCalledWith('/whiteboards/b', {
    method: 'PATCH',
    body: JSON.stringify({ scene: changed, revision: 1 }),
  })
  expect(saver.state).toBe('saved')
  expect(storage.size).toBe(0)
})
it('un export attend la sauvegarde du tableau ouvert', async () => {
  await mount()
  act(() => saver.queue({ ...scene, source: 'modifié' }))
  await act(async () => {
    await flushWhiteboards()
  })
  expect(api).toHaveBeenCalledTimes(1)
  expect(saver.state).toBe('saved')
})
it('conserve le brouillon et bloque l’export lors d’un conflit', async () => {
  await mount()
  vi.mocked(api).mockRejectedValue(new ApiError(409, 'Conflit'))
  act(() => saver.queue({ ...scene, source: 'brouillon' }))
  await act(async () => {
    await expect(flushWhiteboards()).rejects.toThrow('Conflit')
  })
  expect(saver.state).toBe('error')
  expect(storage.get(draftKey('a', 'b'))).toContain('brouillon')
})
it('refuse localement une scène trop volumineuse en conservant son JSON', async () => {
  await mount()
  const oversized = { ...scene, source: 'x'.repeat(2097153) }
  act(() => saver.queue(oversized))
  await act(async () => {
    await expect(saver.flush()).rejects.toThrow('2 Mio')
  })
  expect(api).not.toHaveBeenCalled()
  expect(saver.getScene()).toBe(oversized)
})
it('récupère uniquement le brouillon du bon compte et tableau', async () => {
  storage.set(
    draftKey('other', 'b'),
    JSON.stringify({ revision: 1, scene: { ...scene, source: 'SECRET' } }),
  )
  storage.set(
    draftKey('a', 'b'),
    JSON.stringify({ revision: 1, scene: { ...scene, source: 'Récupéré' } }),
  )
  await mount()
  expect(saver.initialScene.source).toBe('Récupéré')
  expect(saver.state).toBe('dirty')
})
it('utilise la révision renvoyée pour la sauvegarde suivante', async () => {
  await mount()
  act(() => saver.queue({ ...scene, source: 'un' }))
  await act(async () => {
    await saver.flush()
  })
  act(() => saver.queue({ ...scene, source: 'deux' }))
  await act(async () => {
    await saver.flush()
  })
  expect(
    JSON.parse(vi.mocked(api).mock.calls[1]![1]!.body as string).revision,
  ).toBe(2)
})
it('élague les fichiers des images supprimées et les états transitoires', () => {
  const result = makeScene(
    [
      { id: 'a', type: 'image', fileId: 'keep', isDeleted: false },
      { id: 'b', type: 'image', fileId: 'drop', isDeleted: true },
    ] as unknown as ExcalidrawElement[],
    {
      viewBackgroundColor: '#fff',
      scrollX: 0,
      scrollY: 0,
      zoom: { value: 1 },
      gridSize: null,
      collaborators: new Map(),
    } as unknown as AppState,
    { keep: { id: 'keep' }, drop: { id: 'drop' } } as never,
  )
  expect(Object.keys(result.files)).toEqual(['keep'])
  expect(result.elements).toHaveLength(1)
  expect(result.appState).not.toHaveProperty('collaborators')
  expect(sceneBytes({ ...scene, source: 'é' })).toBeGreaterThan(
    sceneBytes({ ...scene, source: 'e' }),
  )
})
it('ignore les onChange identiques pour éviter une boucle de sauvegarde', async () => {
  await mount()
  act(() => {
    saver.queue({ ...scene })
    saver.queue({ ...scene })
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000)
  })
  expect(api).not.toHaveBeenCalled()
  expect(saver.state).toBe('saved')
})
it('conserve la dernière modification arrivée pendant un envoi', async () => {
  await mount()
  let finish!: (value: unknown) => void
  vi.mocked(api).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }) as never,
  )
  act(() => saver.queue({ ...scene, source: 'premier' }))
  let first!: Promise<void>
  await act(async () => {
    first = saver.flush()
  })
  act(() => saver.queue({ ...scene, source: 'dernier' }))
  await act(async () => {
    finish({ revision: 2 })
    await first
  })
  expect(saver.state).toBe('dirty')
  await act(async () => {
    await saver.flush()
  })
  const sent = JSON.parse(vi.mocked(api).mock.calls[1]![1]!.body as string)
  expect(sent.revision).toBe(2)
  expect(sent.scene.source).toBe('dernier')
})
