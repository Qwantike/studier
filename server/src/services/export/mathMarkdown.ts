import type { TokenizerExtension } from 'marked'

// Milkdown saves display math as fenced LaTeX. Also accept display math in
// imported Markdown and preserve backslashes before Marked parses inline text.
const displayPattern =
  /^ {0,3}(?:\$\$[ \t]*\n([\s\S]*?)\n {0,3}\$\$[ \t]*(?:\n|$)|\$\$([^\n]+?)\$\$[ \t]*(?:\n|$))/

export const displayMath: TokenizerExtension = {
  name: 'displayMath',
  level: 'block',
  start(src) {
    const candidates = /^ {0,3}\$\$/gm
    for (const match of src.matchAll(candidates)) {
      if (displayPattern.test(src.slice(match.index))) return match.index
    }
  },
  tokenizer(src) {
    const match = displayPattern.exec(src)
    const text = (match?.[1] ?? match?.[2])?.trim()
    if (match && text) return { type: 'displayMath', raw: match[0], text }
  },
}

const inlinePattern = /^\$(?![\s$])((?:\\[^\n]|[^\\$\n])+?)\$(?![$\d])/
export const inlineMath: TokenizerExtension = {
  name: 'inlineMath',
  level: 'inline',
  start(src) {
    // Skip escape pairs and do not start in the middle of a dollar run.
    const candidates = /\\[^\n]|\$+/g
    for (const match of src.matchAll(candidates)) {
      if (match[0] === '$' && inlinePattern.test(src.slice(match.index)))
        return match.index
    }
  },
  tokenizer(src) {
    const match = inlinePattern.exec(src)
    if (match?.[1] && !/\s$/.test(match[1]))
      return { type: 'inlineMath', raw: match[0], text: match[1] }
  },
}
