import type {} from 'pdfkit'
import type { Token, Tokens } from 'marked'
import type { Graphic, GraphicSource } from './pdfGraphics.js'
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
  graphics: (input: GraphicSource) => Graphic | undefined,
  size = 10,
  face = 'regular',
): void {
  const left = doc.page.margins.left,
    right = doc.page.width - doc.page.margins.right
  const lineHeight = size * 1.55
  let x = left,
    y = doc.y,
    ascent = size,
    descent = lineHeight - size
  const fragments: {
    x: number
    width: number
    highlighted: boolean
    draw: (baseline: number) => void
  }[] = []
  const newline = () => {
    const height = ascent + descent
    if (y + height > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
      y = doc.y
    }
    for (const fragment of fragments) {
      if (fragment.highlighted)
        doc
          .save()
          .rect(fragment.x, y, fragment.width, height)
          .fill(HIGHLIGHT_BACKGROUND)
          .restore()
      fragment.draw(y + ascent)
    }
    fragments.length = 0
    x = left
    y += height
    ascent = size
    descent = lineHeight - size
  }
  const draw = (text: string, style: Style) => {
    for (const word of text.split(/(\s+)/u)) {
      if (!word) continue
      if (word.includes('\n')) {
        for (const ch of word) if (ch === '\n') newline()
        continue
      }
      const space = /^\s+$/.test(word)
      if (space && x === left) continue
      let remaining = word
      while (remaining) {
        doc.font(style.face).fontSize(size)
        let width = doc.widthOfString(remaining)
        if (x + width > right && x > left) {
          newline()
          if (space) break
          doc.font(style.face).fontSize(size)
        }
        let part = remaining
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
        const at = x
        fragments.push({
          x: at,
          width,
          highlighted: style.highlighted,
          draw: (baseline) => {
            doc
              .font(style.face)
              .fontSize(size)
              .fillColor(style.color)
              .text(part, at, baseline, {
                lineBreak: false,
                baseline: 'alphabetic',
              })
          },
        })
        x += width
        remaining = remaining.slice(part.length)
        if (remaining) newline()
      }
    }
  }
  const drawMath = (graphic: Graphic, style: Style) => {
    const scale = Math.min(
      size / (16 * 1.21),
      (right - left) / graphic.width,
      220 / graphic.height,
    )
    const width = graphic.width * scale
    const height = graphic.height * scale
    const above = Math.min(height, Math.max(0, graphic.ascent * scale))
    if (x + width > right && x > left) newline()
    const at = x
    ascent = Math.max(ascent, above)
    descent = Math.max(descent, height - above)
    fragments.push({
      x: at,
      width,
      highlighted: style.highlighted,
      draw: (baseline) => {
        doc.image(graphic.png, at, baseline - above, { width, height })
      },
    })
    x += width
  }
  const visit = (items: Token[], style: Style, depth = 0) => {
    if (depth > 50) throw new Error('Mise en forme trop imbriquée')
    for (const token of items) {
      if (token.type === 'image') {
        if (fragments.length) newline()
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
      if (token.type === 'inlineMath') {
        const graphic = graphics({ kind: 'inline', source: token.text })
        if (graphic) drawMath(graphic, childStyle)
        else draw(token.raw, { ...childStyle, face: 'mono' })
        continue
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
  if (fragments.length) newline()
  doc.x = left
  doc.y = y + lineHeight * 0.3
}
