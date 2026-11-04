import { Download } from 'lucide-react'
import { useState } from 'react'
import { flushForExport } from '../hooks/useChapterSaver'
import { downloadExport } from '../lib/downloadExport'

export default function ExportChapterButton({
  chapterId,
}: {
  chapterId: string
}) {
  const [busy, setBusy] = useState(false)
  const [format, setFormat] = useState<'md' | 'pdf'>('md')
  const [error, setError] = useState<string | null>(null)
  const onClick = async () => {
    setBusy(true)
    setError(null)
    try {
      await flushForExport(chapterId)
      await downloadExport(`/exports/chapters/${chapterId}/${format}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
      <select
        aria-label="Format du chapitre"
        value={format}
        disabled={busy}
        onChange={(e) => setFormat(e.target.value as 'md' | 'pdf')}
        className="rounded-lg border bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        <option value="md">Markdown</option>
        <option value="pdf">PDF</option>
      </select>
      <button
        onClick={() => void onClick()}
        disabled={busy}
        aria-label={`Exporter le chapitre en ${format}`}
        className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm disabled:opacity-60 dark:border-zinc-700"
      >
        <Download size={15} />
        {busy ? 'Export…' : 'Exporter'}
      </button>
    </div>
  )
}
