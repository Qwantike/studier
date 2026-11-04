import type {} from 'pdfkit'
import type { Token, Tokens } from 'marked'
import {
  HIGHLIGHT_BACKGROUND,
  HIGHLIGHT_TEXT,
  noteColor,
} from '../../../../shared/noteFormatting.js'
interface Style {
  color: string
  highlighted: boolean
  face: string
}
/** Petits fragments mesurés explicitement pour dessiner le fond sur chaque ligne du PDF. */
export function inlinePdf(
  doc: PDFKit.PDFDocument,
  tokens: Token[],
  renderImage: (token: Tokens.Image) => void,
  size = 10,
  face = 'regular',
): void {
  const left = doc.page.margins.left,
    right = doc.page.width - doc.page.margins.right
  const height = size * 1.55
  let x = left,
    y = doc.y,
    drawn = false
  const newline = () => {
    x = left
    y += height
  }
  const room = () => {
    if (y + height > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
      y = doc.y
      x = left
    }
  }
  const draw = (text: string, style: Style) => {
    doc.font(style.face).fontSize(size)
    for (const word of text.split(/(\s+)/u)) {
      if (!word) continue
      if (word.includes('\n')) {
        for (const ch of word) if (ch === '\n') newline()
        continue
      }
      const space = /^\s+$/.test(word)
      if (space && x === left) continue
      let remaining = word
      let width = doc.widthOfString(remaining)
      if (x + width > right && x > left) {
        newline()
        if (space) continue
      }
      while (remaining) {
        room()
        let part = remaining
        width = doc.widthOfString(part)
        if (width > right - left) {
          const chars = Array.from(remaining)
          let low = 1,
            high = chars.length
          while (low < high) {
            const middle = Math.ceil((low + high) / 2)
            if (doc.widthOfString(chars.slice(0, middle).join('')) <= right - x)
              low = middle
            else high = middle - 1
          }
          part = chars.slice(0, low).join('')
          width = doc.widthOfString(part)
        }
        if (style.highlighted)
          doc
            .save()
            .rect(x, y, width, height)
            .fill(HIGHLIGHT_BACKGROUND)
            .restore()
        doc
          .font(style.face)
          .fontSize(size)
          .fillColor(style.color)
          .text(part, x, y, { lineBreak: false })
        x += width
        drawn = true
        remaining = remaining.slice(part.length)
        if (remaining) newline()
      }
    }
  }
  const visit = (items: Token[], style: Style, depth = 0) => {
    if (depth > 50) throw new Error('Mise en forme trop imbriquée')
    for (const token of items) {
      if (token.type === 'image') {
        if (x > left) newline()
        doc.y = y
        doc.x = left
        renderImage(token as Tokens.Image)
        y = doc.y
        x = left
        continue
      }
      if (
        token.type === 'br' ||
        (token.type === 'html' && /^<br\s*\/?\s*>$/i.test(token.raw.trim()))
      ) {
        newline()
        continue
      }
      const color =
        token.type === 'noteColor' ? noteColor(token.color)?.light : null
      const childStyle = {
        ...style,
        ...(color ? { color } : {}),
        ...(token.type === 'noteHighlight'
          ? {
              highlighted: true,
              color: style.color === '#202635' ? HIGHLIGHT_TEXT : style.color,
            }
          : {}),
        ...(token.type === 'strong' ? { face: 'bold' } : {}),
      }
      if ('tokens' in token && Array.isArray(token.tokens)) {
        visit(token.tokens, childStyle, depth + 1)
        if (token.type === 'link') draw(` (${token.href})`, style)
      } else
        draw('text' in token ? String(token.text) : token.raw, {
          ...childStyle,
          ...(token.type === 'codespan' ? { face: 'mono' } : {}),
        })
    }
  }
  visit(tokens, { color: '#202635', highlighted: false, face })
  doc.x = left
  doc.y = (drawn || x > left ? y + height : y) + height * 0.3
}
