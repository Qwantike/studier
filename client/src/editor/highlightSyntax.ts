// Delimiter resolution adapted from micromark-extension-gfm-strikethrough (MIT).
// Attribution and license: docs/licenses/highlight-syntax.txt.
import { splice } from 'micromark-util-chunked'
import { classifyCharacter } from 'micromark-util-classify-character'
import { resolveAll } from 'micromark-util-resolve-all'
import type {
  Event,
  Extension,
  Resolver,
  State,
  Token,
  Tokenizer,
} from 'micromark-util-types'

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    noteHighlight: 'noteHighlight'
    noteHighlightText: 'noteHighlightText'
    noteHighlightSequence: 'noteHighlightSequence'
    noteHighlightTemporary: 'noteHighlightTemporary'
  }
}

/** Deux signes =, jamais un ou trois. Les échappements et le code sont gérés par micromark. */
export function highlightSyntax(): Extension {
  const resolve: Resolver = (events, context) => {
    let index = -1
    while (++index < events.length) {
      const closing = events[index]!
      if (
        closing[0] !== 'enter' ||
        closing[1].type !== 'noteHighlightTemporary' ||
        !closing[1]._close
      )
        continue
      let open = index
      while (open--) {
        const opening = events[open]!
        if (
          opening[0] !== 'exit' ||
          opening[1].type !== 'noteHighlightTemporary' ||
          !opening[1]._open
        )
          continue
        opening[1].type = closing[1].type = 'noteHighlightSequence'
        const mark: Token = {
          type: 'noteHighlight',
          start: { ...opening[1].start },
          end: { ...closing[1].end },
        }
        const text: Token = {
          type: 'noteHighlightText',
          start: { ...opening[1].end },
          end: { ...closing[1].start },
        }
        const next: Event[] = [
          ['enter', mark, context],
          ['enter', opening[1], context],
          ['exit', opening[1], context],
          ['enter', text, context],
        ]
        const inside = context.parser.constructs.insideSpan.null
        if (inside)
          splice(
            next,
            next.length,
            0,
            resolveAll(inside, events.slice(open + 1, index), context),
          )
        splice(next, next.length, 0, [
          ['exit', text, context],
          ['enter', closing[1], context],
          ['exit', closing[1], context],
          ['exit', mark, context],
        ])
        splice(events, open - 1, index - open + 3, next)
        index = open + next.length - 2
        break
      }
    }
    for (const [, token] of events)
      if (token.type === 'noteHighlightTemporary') token.type = 'data'
    return events
  }
  const tokenize: Tokenizer = function (effects, ok, nok) {
    const previous = this.previous
    const events = this.events
    let size = 0
    const more: State = (code) => {
      if (code === 61) {
        if (size > 1) return nok(code)
        effects.consume(code)
        size++
        return more
      }
      if (size !== 2) return nok(code)
      const token = effects.exit('noteHighlightTemporary')
      const before = classifyCharacter(previous),
        after = classifyCharacter(code)
      token._open = !after || (after === 2 && Boolean(before))
      token._close = !before || (before === 2 && Boolean(after))
      return ok(code)
    }
    return (code) => {
      if (previous === 61 && events.at(-1)?.[1].type !== 'characterEscape')
        return nok(code)
      effects.enter('noteHighlightTemporary')
      return more(code)
    }
  }
  const construct = { name: 'noteHighlight', tokenize, resolveAll: resolve }
  return {
    text: { 61: construct },
    insideSpan: { null: [construct] },
    attentionMarkers: { null: [61] },
  }
}
