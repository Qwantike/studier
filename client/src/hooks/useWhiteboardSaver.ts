import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import {
  SCENE_LIMIT,
  sceneBytes,
  type Scene,
  type WhiteboardDetail,
  type Whiteboard,
} from '../lib/whiteboardScene'

const savers = new Map<string, () => Promise<void>>()
const flights = new Map<string, Promise<void>>()
export async function flushWhiteboards() {
  await Promise.all([...savers.values()].map((f) => f()))
  await Promise.all([...flights.values()])
}
export const draftKey = (user: string, board: string) =>
  `studier:whiteboard:${user}:${board}`
export function useWhiteboardSaver(board: WhiteboardDetail) {
  const key = draftKey(board.user_id, board.id)
  const [recovered] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null') as {
        scene: Scene
        revision: number
      } | null
      return saved?.scene?.type === 'excalidraw' &&
        Array.isArray(saved.scene.elements) &&
        Number.isInteger(saved.revision)
        ? saved
        : null
    } catch {
      return null
    }
  })
  const [initialScene] = useState(recovered?.scene ?? board.scene)
  const latest = useRef(initialScene)
  const revision = useRef(recovered?.revision ?? board.revision)
  const pending = useRef<Scene | null>(recovered?.scene ?? null)
  const currentJSON = useRef(JSON.stringify(initialScene))
  const chain = useRef<Promise<void>>(Promise.resolve())
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [state, setState] = useState<'saved' | 'dirty' | 'saving' | 'error'>(
    recovered ? 'dirty' : 'saved',
  )
  const [error, setError] = useState<string | null>(
    recovered
      ? 'Brouillon local récupéré. Enregistrez-le ou téléchargez-le en JSON.'
      : null,
  )
  const [bytes, setBytes] = useState(() => sceneBytes(initialScene))

  const writeDraft = useCallback(
    (scene: Scene) => {
      try {
        sessionStorage.setItem(
          key,
          JSON.stringify({ scene, revision: revision.current }),
        )
      } catch {
        /* Le brouillon reste en mémoire et téléchargeable si le stockage local est plein. */
      }
    },
    [key],
  )
  const flush = useCallback((): Promise<void> => {
    clearTimeout(timer.current)
    const send = async () => {
      const scene = pending.current
      if (!scene) return
      setState('saving')
      setError(null)
      try {
        if (sceneBytes(scene) > SCENE_LIMIT)
          throw new Error(
            'Scène trop volumineuse : maximum 2 Mio, images comprises. Retirez des images ou téléchargez le JSON.',
          )
        const result = await api<Whiteboard>(`/whiteboards/${board.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ scene, revision: revision.current }),
        })
        revision.current = result.revision
        if (pending.current === scene) pending.current = null
        if (pending.current) writeDraft(pending.current)
        else sessionStorage.removeItem(key)
        setState(pending.current ? 'dirty' : 'saved')
      } catch (err) {
        if (pending.current) writeDraft(pending.current)
        setState('error')
        setError((err as Error).message)
        throw err
      }
    }
    const result = chain.current.catch(() => {}).then(send)
    chain.current = result
    flights.set(key, result)
    const done = () => {
      if (flights.get(key) === result) flights.delete(key)
    }
    void result.then(done, done)
    return result
  }, [board.id, key, writeDraft])
  const discard = useCallback(async () => {
    clearTimeout(timer.current)
    pending.current = null
    await chain.current.catch(() => {})
    pending.current = null
    sessionStorage.removeItem(key)
  }, [key])
  const queue = useCallback(
    (scene: Scene) => {
      const encoded = JSON.stringify(scene)
      if (encoded === currentJSON.current) return
      currentJSON.current = encoded
      latest.current = scene
      pending.current = scene
      setBytes(sceneBytes(scene))
      setState('dirty')
      writeDraft(scene)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        void flush().catch(() => {})
      }, 1000)
    },
    [flush, writeDraft],
  )
  useEffect(() => {
    savers.set(key, flush)
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current) {
        e.preventDefault()
        e.returnValue = ''
        writeDraft(pending.current)
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      savers.delete(key)
      window.removeEventListener('beforeunload', beforeUnload)
      clearTimeout(timer.current)
      void flush().catch(() => {})
    }
  }, [key, flush, writeDraft])
  return {
    state,
    error,
    bytes,
    queue,
    flush,
    discard,
    initialScene,
    getScene: () => latest.current,
  }
}
