import { languages } from '@codemirror/language-data'
import { notePreview } from '../lib/notePreview'
import { api } from '../api/client'
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core'
import {
  clearTextInCurrentBlockCommand,
  codeBlockSchema,
  setBlockTypeCommand,
} from '@milkdown/kit/preset/commonmark'
import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import 'katex/dist/katex.min.css'
import { useRef, useEffect, useState } from 'react'
import './editor.css'

interface Props {
  /** Markdown initial : lu une seule fois, l'éditeur est ensuite la source de vérité. */
  chapterId: string
  initial: string
  onChange: (markdown: string) => void
}

function Inner({ chapterId, initial, onChange }: Props) {
  const [uploadError, setUploadError] = useState<string | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: initial,

      featureConfigs: {
        [Crepe.Feature.ImageBlock]: {
          onUpload: async (file) => {
            setUploadError(null)
            try {
              if (file.size > 4 * 1024 * 1024)
                throw new Error('Image trop volumineuse : maximum 4 Mio.')
              const body = new FormData()
              body.append('image', file)
              const result = await api<{ url: string }>(
                `/chapters/${chapterId}/images`,
                { method: 'POST', headers: {}, body },
              )
              return result.url
            } catch (error) {
              setUploadError(
                error instanceof Error
                  ? error.message
                  : 'Import de l’image impossible',
              )
              // Garder le bloc vide pour réessayer ; l’erreur reste visible au-dessus de l’éditeur.
              return ''
            }
          },
          blockUploadButton: 'Importer',
          inlineUploadButton: 'Importer',
          blockUploadPlaceholderText:
            'Importer une image (4 Mio maximum) ou coller son URL',
          inlineUploadPlaceholderText: 'Importer une image ou coller son URL',
          onImageLoadError: () =>
            setUploadError(
              'Image inaccessible. Vérifiez votre connexion et la présence du fichier dans Profil → Images des notes.',
            ),
        },
        // Coloration syntaxique : la liste complète des langages CodeMirror, chargés à la demande.
        [Crepe.Feature.CodeMirror]: {
          languages,
          renderPreview: notePreview,
        },
        [Crepe.Feature.BlockEdit]: {
          buildMenu: (builder) => {
            builder.getGroup('advanced').addItem('plot', {
              label: 'Fonctions',
              icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 2v19h19M4 17C9 17 9 6 14 6s4 9 8 9"/></svg>',
              onRun: (ctx) => {
                const commands = ctx.get(commandsCtx)
                commands.call(clearTextInCurrentBlockCommand.key)
                commands.call(setBlockTypeCommand.key, {
                  nodeType: codeBlockSchema.type(ctx),
                  attrs: { language: 'plot' },
                })
                const view = ctx.get(editorViewCtx)
                view.dispatch(
                  view.state.tr
                    .insertText('sin(x)\nx^2 / 4\nx: -5, 5\ny: -2, 7')
                    .scrollIntoView(),
                )
                view.focus()
              },
            })
            builder.getGroup('advanced').addItem('mermaid', {
              label: 'Mermaid',
              icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="8" y="2" width="8" height="5" rx="1"/><path d="M12 7v5M5 12h14M5 12v4M19 12v4"/><rect x="1" y="16" width="8" height="5" rx="1"/><rect x="15" y="16" width="8" height="5" rx="1"/></svg>',
              onRun: (ctx) => {
                const commands = ctx.get(commandsCtx)
                // Même chemin que le bloc Code natif : retire aussi /mermaid.
                commands.call(clearTextInCurrentBlockCommand.key)
                commands.call(setBlockTypeCommand.key, {
                  nodeType: codeBlockSchema.type(ctx),
                  attrs: { language: 'mermaid' },
                })
                const view = ctx.get(editorViewCtx)
                view.dispatch(
                  view.state.tr
                    .insertText('flowchart TD\n  A[Idée] --> B[Développement]')
                    .scrollIntoView(),
                )
                view.focus()
              },
            })
          },
        },
        [Crepe.Feature.Placeholder]: {
          text: 'Écrivez vos notes… tapez / pour insérer un bloc, $$ pour une formule',
        },
      },
    })
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, previous) => {
        if (markdown !== previous) onChangeRef.current(markdown)
      })
    })
    return crepe
  }, [])

  return (
    <>
      {uploadError && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {uploadError}{' '}
          <button type="button" onClick={() => setUploadError(null)}>
            Fermer
          </button>
        </p>
      )}
      <Milkdown />
    </>
  )
}

export default function MarkdownEditor(props: Props) {
  return (
    <MilkdownProvider>
      <div className="chapter-editor">
        <Inner {...props} />
      </div>
    </MilkdownProvider>
  )
}
