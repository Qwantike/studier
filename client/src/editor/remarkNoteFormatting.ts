import type { Parent, PhrasingContent, Root } from 'mdast'
import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown'
import type { Options as ToMarkdownExtension } from 'mdast-util-to-markdown'
import type { RemarkPluginRaw } from '@milkdown/kit/transformer'
import {
  colorOpen,
  parseColorOpen,
  type NoteColor,
} from '../../../shared/noteFormatting'
import { highlightSyntax } from './highlightSyntax'

export interface NoteHighlight extends Parent {
  type: 'noteHighlight'
  children: PhrasingContent[]
}
export interface NoteColorNode extends Parent {
  type: 'noteColor'
  color: NoteColor
  children: PhrasingContent[]
}
declare module 'mdast' {
  interface PhrasingContentMap {
    noteHighlight: NoteHighlight
    noteColor: NoteColorNode
  }
  interface RootContentMap {
    noteHighlight: NoteHighlight
    noteColor: NoteColorNode
  }
}

declare module 'mdast-util-to-markdown' {
  interface ConstructNameMap {
    noteHighlight: 'noteHighlight'
  }
}

const fromMarkdown: FromMarkdownExtension = {
  canContainEols: ['noteHighlight'],
  enter: {
    noteHighlight(token) {
      this.enter({ type: 'noteHighlight', children: [] }, token)
    },
  },
  exit: {
    noteHighlight(token) {
      this.exit(token)
    },
  },
}
const toMarkdown: ToMarkdownExtension = {
  handlers: {
    noteHighlight(node, _, state, info) {
      const exit = state.enter('noteHighlight')
      const tracker = state.createTracker(info)
      const open = tracker.move('==')
      const content = state.containerPhrasing(node as NoteHighlight, {
        ...tracker.current(),
        before: open,
        after: '=',
      })
      exit()
      return open + content + '=='
    },
    noteColor(node, _, state, info) {
      const color = node as NoteColorNode
      const tracker = state.createTracker(info)
      const open = tracker.move(colorOpen(color.color))
      return (
        open +
        state.containerPhrasing(color, {
          ...tracker.current(),
          before: '>',
          after: '<',
        }) +
        '</span>'
      )
    },
  },
  // Les = littéraux sont échappés dans le texte, jamais dans le code ou les URL.
  unsafe: [
    {
      character: '=',
      after: '=',
      inConstruct: 'phrasing',
      notInConstruct: [
        'autolink',
        'destinationLiteral',
        'destinationRaw',
        'reference',
        'titleQuote',
        'titleApostrophe',
      ],
    },
  ],
}

/** Apparier les spans dans chaque parent, y compris ceux qu'on ne reconnaît pas. */
function transformColors(parent: Parent, depth = 0): void {
  if (depth > 50) return
  for (const node of parent.children)
    if ('children' in node) transformColors(node as Parent, depth + 1)
  const children = parent.children
  const stack: { index: number; color: NoteColor | null }[] = []
  const pairs = new Map<number, { end: number; color: NoteColor }>()
  for (const [i, node] of children.entries()) {
    if (node.type !== 'html') continue
    if (/^<span\b[^>]*>$/i.test(node.value))
      stack.push({ index: i, color: parseColorOpen(node.value) })
    else if (/^<\/span\s*>$/i.test(node.value)) {
      const opening = stack.pop()
      if (opening?.color)
        pairs.set(opening.index, { end: i, color: opening.color })
    }
  }
  const collect = (
    start: number,
    end: number,
    nesting = 0,
  ): PhrasingContent[] => {
    if (nesting > 32) return children.slice(start, end) as PhrasingContent[]
    const result: PhrasingContent[] = []
    for (let i = start; i < end; i++) {
      const pair = pairs.get(i)
      if (pair && pair.end < end) {
        result.push({
          type: 'noteColor',
          color: pair.color,
          children: collect(i + 1, pair.end, nesting + 1),
        })
        i = pair.end
      } else result.push(children[i] as PhrasingContent)
    }
    return result
  }
  if (pairs.size) parent.children = collect(0, children.length)
}
export const remarkNoteFormatting: RemarkPluginRaw<unknown> = function () {
  const data = this.data()
  ;(data.micromarkExtensions ??= []).push(highlightSyntax())
  ;(data.fromMarkdownExtensions ??= []).push(fromMarkdown)
  ;(data.toMarkdownExtensions ??= []).push(toMarkdown)
  return (tree: Root) => transformColors(tree)
}
