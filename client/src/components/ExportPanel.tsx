import { useState } from 'react'
import { useTree } from '../hooks/useTree'
import { flushForExport } from '../hooks/useChapterSaver'
import { downloadExport } from '../lib/downloadExport'
import { buildRows, type Row } from './treeModel'

type Format = 'md' | 'pdf'
const button =
  'rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700'
export default function ExportPanel({
  complete = true,
}: {
  complete?: boolean
}) {
  const tree = useTree()
  const [selected, setSelected] = useState<
    Record<string, { level: Row['level']; id: string }>
  >({})
  const [formats, setFormats] = useState<Format[]>(['md'])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (body: unknown) => {
    setBusy(true)
    setError(null)
    try {
      await flushForExport()
      await downloadExport('/exports', body)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const rows = tree.data ? buildRows(tree.data) : []
  const renderRows = (items: Row[], depth = 0) =>
    items.map((row) => (
      <div key={row.id}>
        <label
          className="flex items-center gap-2 py-1 text-sm"
          style={{ paddingLeft: depth * 14 }}
        >
          <input
            type="checkbox"
            checked={Boolean(selected[row.id])}
            onChange={(e) => {
              const checked = e.target.checked
              setSelected((prev) => {
                const next = { ...prev }
                if (checked) next[row.id] = { level: row.level, id: row.id }
                else delete next[row.id]
                return next
              })
            }}
          />
          <span>{row.name}</span>
          <span className="text-xs text-zinc-500">
            {
              {
                years: 'année',
                semesters: 'semestre',
                subjects: 'cours',
                chapters: 'chapitre',
              }[row.level]
            }
          </span>
        </label>
        {renderRows(row.children, depth + 1)}
      </div>
    ))
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Cochez des années, semestres, cours ou chapitres. Un parent inclut ses
        chapitres ; les sélections qui se recoupent sont dédupliquées.
      </p>
      {tree.isLoading && <p role="status">Chargement des cours…</p>}
      {tree.error && (
        <p role="alert" className="text-sm text-red-600">
          {tree.error.message}
        </p>
      )}
      <fieldset
        disabled={busy || tree.isLoading || Boolean(tree.error)}
        className="space-y-3"
      >
        <legend className="sr-only">Sélection de cours à exporter</legend>
        <div className="max-h-64 overflow-auto rounded-lg border p-2 dark:border-zinc-700">
          {renderRows(rows)}
          {tree.data && !rows.length && <p className="text-sm">Aucun cours.</p>}
        </div>
        <div className="flex gap-4">
          {(['md', 'pdf'] as const).map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formats.includes(f)}
                onChange={(e) =>
                  setFormats((prev) =>
                    e.target.checked
                      ? [...prev, f]
                      : prev.filter((v) => v !== f),
                  )
                }
              />
              {f === 'md' ? 'Markdown (.md)' : 'PDF'}
            </label>
          ))}
        </div>
        <button
          className={button}
          disabled={busy || !Object.keys(selected).length || !formats.length}
          onClick={() =>
            void run({
              kind: 'selection',
              roots: Object.values(selected),
              formats,
            })
          }
        >
          Télécharger la sélection (.zip)
        </button>
      </fieldset>
      {complete && (
        <div className="space-y-2 border-t pt-3 dark:border-zinc-700">
          <h3 className="text-sm font-semibold">Toutes mes données</h3>
          <p className="text-xs text-zinc-500">
            ZIP : tous les cours en MD et PDF, plus les données complètes en
            JSON. Base .db : instantané SQLite avec les relations, pour
            migration vers un autre service.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy}
              className={button}
              onClick={() => void run({ kind: 'complete', format: 'zip' })}
            >
              Tout télécharger (.zip)
            </button>
            <button
              disabled={busy}
              className={button}
              onClick={() => void run({ kind: 'complete', format: 'db' })}
            >
              Base portable (.db)
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            Les mots de passe et jetons sont exclus. L'archive contient des
            données personnelles et peut contenir des URL de calendriers
            privées.
          </p>
        </div>
      )}
      <p className="text-xs text-zinc-500">
        PDF : 200 chapitres maximum par archive. Images et formules conservées
        sous forme textuelle. Utilisez .db pour les exports complets plus
        volumineux.
      </p>
      {busy && (
        <p role="status" className="text-sm">
          Préparation du téléchargement…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
