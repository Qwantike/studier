import { languages } from '@codemirror/language-data'
import { mermaidPreview } from '../lib/mermaidPreview'
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
import { useRef, useEffect } from 'react'
import './editor.css'

interface Props {
  /** Markdown initial : lu une seule fois, l'éditeur est ensuite la source de vérité. */
  initial: string
  onChange: (markdown: string) => void
}

function Inner({ initial, onChange }: Props) {
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: initial,
      // Pas de téléversement d'images en V1 : on désactive le bloc image (les liens Markdown restent possibles).
      features: { [Crepe.Feature.ImageBlock]: false },
      featureConfigs: {
        // Coloration syntaxique : la liste complète des langages CodeMirror, chargés à la demande.
        [Crepe.Feature.CodeMirror]: {
          languages,
          renderPreview: mermaidPreview,
        },
        [Crepe.Feature.BlockEdit]: {
          buildMenu: (builder) => {
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

  return <Milkdown />
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
