import { lazy, Suspense, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { useTree } from '../hooks/useTree'
import { flushWhiteboards } from '../hooks/useWhiteboardSaver'
import type {
  BoardUsage,
  Whiteboard,
  WhiteboardDetail,
} from '../lib/whiteboardScene'

const WhiteboardCanvas = lazy(() => import('../components/WhiteboardCanvas'))
const button =
  'rounded-lg border px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700'
export default function WhiteboardsPage() {
  const { id } = useParams(),
    navigate = useNavigate(),
    qc = useQueryClient()
  const [search, setSearch] = useSearchParams()
  const subject = search.get('subject_id'),
    chapter = search.get('chapter_id')
  const scope = subject
    ? `subject_id=${encodeURIComponent(subject)}`
    : chapter
      ? `chapter_id=${encodeURIComponent(chapter)}`
      : ''
  const parent = subject
    ? `subjects:${subject}`
    : chapter
      ? `chapters:${chapter}`
      : ''
  const tree = useTree()
  const list = useQuery({
    queryKey: ['whiteboards', scope],
    queryFn: () => api<Whiteboard[]>(`/whiteboards${scope ? `?${scope}` : ''}`),
  })
  const usage = useQuery({
    queryKey: ['whiteboard-usage'],
    queryFn: () => api<BoardUsage>('/whiteboards/usage'),
  })
  const detail = useQuery({
    queryKey: ['whiteboard', id],
    queryFn: () => api<WhiteboardDetail>(`/whiteboards/${id}`),
    enabled: !!id,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: 0,
  })
  const [title, setTitle] = useState('Nouveau tableau')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null)
  const [canvasKey, setCanvasKey] = useState(0)
  const options =
    tree.data?.flatMap((y) =>
      y.semesters.flatMap((s) =>
        s.subjects.flatMap((su) => [
          {
            value: `subjects:${su.id}`,
            label: `${y.label} / ${s.label} / ${su.name}`,
          },
          ...su.chapters.map((c) => ({
            value: `chapters:${c.id}`,
            label: `${y.label} / ${s.label} / ${su.name} / ${c.title}`,
          })),
        ]),
      ),
    ) ?? []
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['whiteboards'] })
    await qc.invalidateQueries({ queryKey: ['whiteboard-usage'] })
  }
  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const go = (boardId?: string) =>
    run(async () => {
      await flushWhiteboards()
      await refresh()
      navigate(
        `/tableaux${boardId ? `/${boardId}` : ''}${scope ? `?${scope}` : ''}`,
      )
    })
  return (
    <main className="mx-auto w-full max-w-[1400px] space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">
          {id ? (detail.data?.title ?? 'Tableau blanc') : 'Tableaux blancs'}
        </h1>
        {id && (
          <button className={button} disabled={busy} onClick={() => void go()}>
            Retour aux tableaux
          </button>
        )}
      </header>
      {usage.data && (
        <p className="text-xs text-zinc-500">
          Compte : {(usage.data.bytes / 1048576).toFixed(2)} / 20 Mio ·{' '}
          {usage.data.count} / 200 tableaux
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {id ? (
        <>
          {detail.isLoading && <p role="status">Chargement du tableau…</p>}
          {detail.error && (
            <p role="alert" className="text-red-600">
              {detail.error.message}
            </p>
          )}
          {detail.data && (
            <Suspense fallback={<p role="status">Chargement d'Excalidraw…</p>}>
              <WhiteboardCanvas
                key={`${id}:${canvasKey}`}
                board={detail.data}
                reload={() => {
                  void run(async () => {
                    const result = await detail.refetch()
                    if (result.error) throw result.error
                    setCanvasKey((n) => n + 1)
                    await refresh()
                  })
                }}
              />
            </Suspense>
          )}
        </>
      ) : (
        <>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => {
                if (!parent)
                  throw new Error(
                    'Choisissez la matière ou le chapitre du tableau.',
                  )
                const [level, target] = parent.split(':')
                const result = await api<Whiteboard>('/whiteboards', {
                  method: 'POST',
                  body: JSON.stringify({
                    title,
                    [level === 'subjects' ? 'subject_id' : 'chapter_id']:
                      target,
                  }),
                })
                await refresh()
                navigate(`/tableaux/${result.id}${scope ? `?${scope}` : ''}`)
              })
            }}
          >
            <label className="flex min-w-0 max-w-full flex-col gap-1 text-sm">
              Matière ou chapitre
              <select
                aria-label="Matière ou chapitre"
                className="max-w-full rounded-lg border bg-white px-2 py-2 dark:bg-zinc-900"
                value={parent}
                onChange={(e) => {
                  const [level, target] = e.target.value.split(':')
                  setSearch(
                    target
                      ? {
                          [level === 'subjects' ? 'subject_id' : 'chapter_id']:
                            target,
                        }
                      : {},
                  )
                }}
              >
                <option value="">
                  Tous les tableaux — choisir un parent pour créer
                </option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Titre
              <input
                className="rounded-lg border bg-transparent px-2 py-2"
                maxLength={200}
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <button
              className={button}
              disabled={busy || !parent || !title.trim() || tree.isLoading}
            >
              Créer un tableau
            </button>
          </form>
          {tree.error && (
            <p role="alert" className="text-red-600">
              {tree.error.message}
            </p>
          )}
          {list.isLoading && <p role="status">Chargement…</p>}
          {list.error && (
            <p role="alert" className="text-red-600">
              {list.error.message}
            </p>
          )}
          {!list.isLoading && !list.error && !list.data?.length && (
            <p className="text-sm text-zinc-500">
              Aucun tableau pour cette sélection.
            </p>
          )}
          <ul className="space-y-2">
            {list.data?.map((board) => (
              <li
                key={board.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border p-3 dark:border-zinc-700"
              >
                <button
                  className="min-w-0 flex-1 truncate text-left font-medium text-indigo-600"
                  onClick={() => void go(board.id)}
                >
                  {board.title}
                </button>
                <span className="text-xs text-zinc-500">
                  {(board.scene_bytes / 1024).toFixed(0)} Kio ·{' '}
                  {new Date(board.updated_at).toLocaleString()}
                </span>
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => {
                    const next = window.prompt('Nouveau titre', board.title)
                    if (next?.trim())
                      void run(async () => {
                        await api(`/whiteboards/${board.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({
                            title: next.trim(),
                            revision: board.revision,
                          }),
                        })
                        await refresh()
                      })
                  }}
                >
                  Renommer
                </button>
                <button
                  className={`${button} text-red-600`}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Supprimer « ${board.title} » ?`))
                      void run(async () => {
                        await api(
                          `/whiteboards/${board.id}?revision=${board.revision}`,
                          { method: 'DELETE' },
                        )
                        await refresh()
                      })
                  }}
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
