import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { ChapterStatus } from '../api/types'

export interface ChapterPatch {
  title?: string
  content_md?: string
  status?: ChapterStatus
}
export type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

// Sauvegardes en cours par chapitre : la page attend leur fin avant de recharger
// un chapitre, pour ne jamais afficher une version plus ancienne que la dernière frappe.
const editorSnapshots = new Map<string, () => void>()
/** Capture synchrone avant une action : Milkdown diffère ses notifications de frappe. */
export function registerChapterSnapshot(
  chapterId: string,
  snapshot: () => void,
): () => void {
  editorSnapshots.set(chapterId, snapshot)
  return () => {
    if (editorSnapshots.get(chapterId) === snapshot)
      editorSnapshots.delete(chapterId)
  }
}
const exportFlushers = new Map<string, () => Promise<void>>()
export async function flushForExport(chapterId?: string): Promise<void> {
  if (chapterId) {
    editorSnapshots.get(chapterId)?.()
    await exportFlushers.get(chapterId)?.()
    await waitForSaves(chapterId)
  } else {
    for (const snapshot of [...editorSnapshots.values()]) snapshot()
    await Promise.all([...exportFlushers.values()].map((flush) => flush()))
    await Promise.all([...inflightByChapter.values()])
  }
}

const inflightByChapter = new Map<string, Promise<void>>()
export const waitForSaves = (chapterId: string) =>
  inflightByChapter.get(chapterId) ?? Promise.resolve()

/**
 * Sauvegarde automatique différée d'un chapitre.
 * - queue(patch) : fusionne les champs modifiés et relance le délai (1 s par défaut)
 * - flush() : envoie immédiatement (changement de statut, démontage de la page)
 */
export function useChapterSaver(chapterId: string, delay = 1000) {
  const qc = useQueryClient()
  const pending = useRef<ChapterPatch>({})
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const chain = useRef<Promise<void>>(Promise.resolve())
  const retryFlush = useRef<() => Promise<void>>(() => Promise.resolve())
  const [state, setState] = useState<SaveState>('saved')

  const hasPending = useCallback(
    () => Object.keys(pending.current).length > 0,
    [],
  )

  const send = useCallback(async () => {
    clearTimeout(timer.current)
    if (!hasPending()) return
    const body = pending.current
    pending.current = {}
    setState('saving')
    try {
      await api(`/chapters/${chapterId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      // Le titre et le statut apparaissent dans la barre latérale.
      if (body.title !== undefined || body.status !== undefined)
        void qc.invalidateQueries({ queryKey: ['tree'] })
      if (body.status !== undefined) {
        // La progression des évaluations dépend du statut des chapitres.
        void qc.invalidateQueries({ queryKey: ['evaluations'] })
        void qc.invalidateQueries({ queryKey: ['evaluation'] })
        void qc.invalidateQueries({ queryKey: ['reviews'] })
      }
      setState(hasPending() ? 'dirty' : 'saved')
    } catch {
      pending.current = { ...body, ...pending.current } // on garde les données pour le nouvel essai
      setState('error')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void retryFlush.current(), 3000)
    }
  }, [chapterId, qc, hasPending])

  // Les envois sont chaînés pour garder l'ordre des frappes.
  const flush = useCallback((): Promise<void> => {
    const p = chain.current.then(send)
    chain.current = p
    inflightByChapter.set(chapterId, p)
    const done = () => {
      if (inflightByChapter.get(chapterId) === p)
        inflightByChapter.delete(chapterId)
    }
    void p.then(done, done)
    return p
  }, [chapterId, send])

  const queue = useCallback(
    (patch: ChapterPatch) => {
      pending.current = { ...pending.current, ...patch }
      setState('dirty')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), delay)
    },
    [delay, flush],
  )

  useEffect(() => {
    retryFlush.current = flush
    // Fermeture de l'onglet : envoi "keepalive" des modifications en attente.
    const onUnload = () => {
      if (!hasPending()) return
      void fetch(`/api/chapters/${chapterId}`, {
        method: 'PATCH',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending.current),
      })
    }
    const exportFlush = async () => {
      await flush()
      if (hasPending())
        throw new Error('Sauvegarde impossible. Réessayez avant de continuer.')
    }
    exportFlushers.set(chapterId, exportFlush)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      if (exportFlushers.get(chapterId) === exportFlush)
        exportFlushers.delete(chapterId)
      window.removeEventListener('beforeunload', onUnload)
      void flush() // navigation vers un autre chapitre : on n'abandonne rien
    }
  }, [chapterId, flush, hasPending])

  return { state, queue, flush }
}
