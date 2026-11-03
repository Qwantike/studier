import { useRef, useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Excalidraw,
  MainMenu,
  exportToBlob,
  exportToSvg,
} from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import '@excalidraw/excalidraw/index.css'
import { useWhiteboardSaver } from '../hooks/useWhiteboardSaver'
import {
  makeScene,
  downloadBlob,
  type WhiteboardDetail,
} from '../lib/whiteboardScene'

export default function WhiteboardCanvas({
  board,
  reload,
}: {
  board: WhiteboardDetail
  reload: () => void
}) {
  const api = useRef<ExcalidrawImperativeAPI | null>(null)
  const saver = useWhiteboardSaver(board)
  const qc = useQueryClient()
  useEffect(() => {
    if (saver.state === 'saved') {
      void qc.invalidateQueries({ queryKey: ['whiteboard-usage'] })
      void qc.invalidateQueries({ queryKey: ['whiteboards'] })
    }
  }, [saver.state, qc])
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const downloadJSON = () =>
    downloadBlob(
      new Blob([JSON.stringify(saver.getScene(), null, 2)], {
        type: 'application/json',
      }),
      `${board.id}.excalidraw`,
    )
  const exportImage = async (format: 'png' | 'svg') => {
    setExporting(true)
    setError(null)
    try {
      if (!api.current) return
      const elements = api.current.getSceneElements(),
        files = api.current.getFiles()
      if (!elements.length) throw new Error('Le tableau est vide.')
      const opts = {
        elements,
        files,
        appState: {
          ...api.current.getAppState(),
          exportBackground: true,
          exportEmbedScene: false,
        },
      }
      const blob =
        format === 'png'
          ? await exportToBlob({
              ...opts,
              mimeType: 'image/png',
              maxWidthOrHeight: 4096,
            })
          : new Blob(
              [(await exportToSvg({ ...opts, exportPadding: 10 })).outerHTML],
              { type: 'image/svg+xml' },
            )
      downloadBlob(blob, `${board.id}.${format}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setExporting(false)
    }
  }
  return (
    <section className="space-y-3" aria-label="Éditeur du tableau blanc">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          className="rounded-lg border px-3 py-2"
          onClick={() => void saver.flush().catch(() => {})}
          disabled={saver.state === 'saving'}
        >
          Enregistrer
        </button>
        <span role="status">
          {
            {
              saved: 'Enregistré',
              dirty: 'Modifié…',
              saving: 'Enregistrement…',
              error: 'Échec de sauvegarde',
            }[saver.state]
          }{' '}
          · {(saver.bytes / 1024).toFixed(0)} / 2048 Kio
        </span>
        <button className="rounded-lg border px-3 py-2" onClick={downloadJSON}>
          Télécharger JSON
        </button>
        <button
          className="rounded-lg border px-3 py-2"
          disabled={exporting}
          onClick={() => void exportImage('png')}
        >
          PNG
        </button>
        <button
          className="rounded-lg border px-3 py-2"
          disabled={exporting}
          onClick={() => void exportImage('svg')}
        >
          SVG
        </button>
        <button
          className="rounded-lg border px-3 py-2"
          onClick={() => {
            if (
              window.confirm(
                'Recharger la version serveur et abandonner les modifications locales ? Téléchargez le JSON avant de continuer si nécessaire.',
              )
            ) {
              void saver.discard().then(reload)
            }
          }}
        >
          Recharger
        </button>
      </div>
      {(saver.error || error) && (
        <p role="alert" className="text-sm text-red-600">
          {saver.error ?? error}
        </p>
      )}
      <div className="h-[70dvh] min-h-[420px] overflow-hidden rounded-xl border dark:border-zinc-700">
        <Excalidraw
          initialData={saver.initialScene}
          excalidrawAPI={(value) => {
            api.current = value
          }}
          langCode="fr-FR"
          onChange={(elements, state, files) =>
            saver.queue(makeScene(elements, state, files))
          }
          validateEmbeddable={() => false}
          onLinkOpen={(element, event) => {
            if (element.link && !/^(https?:\/\/|mailto:|#)/i.test(element.link))
              event.preventDefault()
          }}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              export: false,
              toggleTheme: true,
            },
            tools: { image: true },
          }}
        >
          <MainMenu>
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
            <MainMenu.DefaultItems.ToggleTheme />
          </MainMenu>
        </Excalidraw>
      </div>
      <p className="text-xs text-zinc-500">
        Sauvegarde automatique après 1 seconde. 2 Mio par scène, 20 Mio et 200
        tableaux par compte. Le brouillon de cet onglet est conservé au mieux en
        cas d'échec ; téléchargez le JSON avant de fermer si nécessaire. Les
        intégrations de pages web sont désactivées.
      </p>
    </section>
  )
}
