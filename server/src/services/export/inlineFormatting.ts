import { Marked, type TokenizerExtension } from 'marked'
import { parseColorOpen } from '../../../../shared/noteFormatting.js'

/** Cherche la fermeture en sautant les échappements, le code et les destinations des liens. */
function highlightEnd(source: string): number {
  for (let i = 2; i < source.length; i++) {
    const c = source[i]
    if (c === '\\') {
      i++
      continue
    }
    if (c === '`') {
      const run = /^`+/.exec(source.slice(i))![0]
      let end = source.indexOf(run, i + run.length)
      while (
        end >= 0 &&
        (source[end - 1] === '`' || source[end + run.length] === '`')
      )
        end = source.indexOf(run, end + run.length)
      if (end >= 0) {
        i = end + run.length - 1
        continue
      }
    }
    if (c === '<') {
      const tag = /^<[^>\n]*>/.exec(source.slice(i))
      if (tag) {
        i += tag[0].length - 1
        continue
      }
    }
    if (c === ']' && source[i + 1] === '(') {
      let depth = 1,
        j = i + 2
      for (; j < source.length && depth; j++) {
        if (source[j] === '\\') j++
        else if (source[j] === '(') depth++
        else if (source[j] === ')') depth--
      }
      if (!depth) {
        i = j - 1
        continue
      }
    }
    if (
      source.startsWith('==', i) &&
      source[i - 1] !== '=' &&
      source[i + 2] !== '=' &&
      !/\s/.test(source[i - 1]!)
    ) {
      const before = /[\p{P}\p{S}]/u.test(source[i - 1]!),
        next = source[i + 2]
      if (!before || !next || /[\s\p{P}\p{S}]/u.test(next)) return i
    }
  }
  return -1
}
const highlight: TokenizerExtension = {
  name: 'noteHighlight',
  level: 'inline',
  start: (src) => src.indexOf('=='),
  tokenizer(src) {
    if (!src.startsWith('==') || src[2] === '=' || !src[2] || /\s/.test(src[2]))
      return
    const end = highlightEnd(src)
    if (end < 0) return
    return {
      type: 'noteHighlight',
      raw: src.slice(0, end + 2),
      tokens: this.lexer.inlineTokens(src.slice(2, end)),
    }
  },
  childTokens: ['tokens'],
}
const color: TokenizerExtension = {
  name: 'noteColor',
  level: 'inline',
  start: (src) => src.indexOf('<span'),
  tokenizer(src) {
    const opening = /^<span\b[^>\n]*>/.exec(src)?.[0]
    const id = opening && parseColorOpen(opening)
    if (!opening || !id) return
    const tags = /<\/?span\b[^>\n]*>/gi
    tags.lastIndex = opening.length
    let depth = 1,
      tag: RegExpExecArray | null
    while ((tag = tags.exec(src))) {
      if (/^<\//.test(tag[0])) depth--
      else depth++
      if (!depth)
        return {
          type: 'noteColor',
          color: id,
          raw: src.slice(0, tags.lastIndex),
          tokens: this.lexer.inlineTokens(src.slice(opening.length, tag.index)),
        }
    }
    return
  },
  childTokens: ['tokens'],
}
/** Instance privée : les autres usages de marked conservent leur configuration. */
export const documentMarkdown = new Marked({ extensions: [highlight, color] })
