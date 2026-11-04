import {
  parsePlot,
  plotGeometry,
  PLOT_WIDTH,
  PLOT_HEIGHT,
} from '../../../../shared/functionPlot.js'
import sharp from 'sharp'
import PDFDocument from 'pdfkit'
import { marked, type Token, type Tokens } from 'marked'
import type { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { HttpError } from '../../errors.js'

export interface Chapter {
  title: string
  content_md: string
}
export function slug(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 55)
      .replace(/-+$/, '') || 'sans-titre'
  )
}
export function markdown(chapter: Chapter): string {
  const title = chapter.title.trim() || 'Sans titre'
  const body = chapter.content_md
    .replace(/\r\n/g, '\n')
    .replace(/^(?:[ \t]*\n)+/, '')
  const first = /^#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\n|$)/
    .exec(body)?.[1]
    ?.trim()
    .toLowerCase()
  return `${(first === title.toLowerCase() ? body : `# ${title}\n\n${body}`).trimEnd()}\n`
}
const font = (name: string) =>
  fileURLToPath(new URL(`../../../assets/fonts/${name}.ttf`, import.meta.url))
const MAX_PDF_BYTES = 16 * 1024 * 1024

/** Rendu textuel sûr : aucun HTML exécuté, aucune requête réseau pour images/liens. */
export async function pdf(
  chapter: Chapter,
  images: ReadonlyMap<string, Buffer> = new Map(),
): Promise<Buffer> {
  const imageSizes = new Map<string, { width: number; height: number }>()
  for (const [url, buffer] of images) {
    if (!chapter.content_md.includes(url)) continue
    const meta = await sharp(buffer).metadata()
    if (meta.width && meta.height)
      imageSizes.set(url, { width: meta.width, height: meta.height })
  }
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: { Title: chapter.title, Producer: 'Studier' },
    })
    const chunks: Buffer[] = []
    let bytes = 0
    doc.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > MAX_PDF_BYTES)
        (doc as unknown as Readable).destroy(
          new HttpError(413, 'PDF trop volumineux'),
        )
      else chunks.push(chunk)
    })
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    try {
      doc.registerFont('regular', font('DejaVuSans'))
      doc.registerFont('bold', font('DejaVuSans-Bold'))
      doc.registerFont('mono', font('DejaVuSansMono'))
      const plain = (tokens: Token[] | undefined, fallback = ''): string =>
        (tokens ?? [])
          .map((token): string => {
            if (token.type === 'image')
              return `[Image : ${token.text}] (${token.href})`
            if (token.type === 'link')
              return `${plain(token.tokens, token.text)} (${token.href})`
            if (
              token.type === 'br' ||
              (token.type === 'html' &&
                /^<br\s*\/?\s*>$/i.test(token.raw.trim()))
            )
              return '\n'
            if ('tokens' in token && Array.isArray(token.tokens))
              return plain(
                token.tokens,
                'text' in token ? String(token.text) : '',
              )
            return 'text' in token ? String(token.text) : token.raw
          })
          .join('') || fallback
      const line = (text: string, size = 10, face = 'regular') => {
        doc
          .font(face)
          .fontSize(size)
          .fillColor('#202635')
          .text(text, { lineGap: 3 })
        doc.moveDown(0.5)
      }
      const room = (height: number) => {
        if (doc.y + height > doc.page.height - doc.page.margins.bottom)
          doc.addPage()
      }
      const renderImage = (token: Tokens.Image) => {
        const buffer = images.get(token.href)
        if (!buffer) {
          line(`[Image non incorporée : ${token.text}] (${token.href})`)
          return
        }
        const dimensions = imageSizes.get(token.href)!
        const scale = Math.min(
          1,
          (doc.page.width - 96) / dimensions.width,
          320 / dimensions.height,
        )
        const width = dimensions.width * scale,
          height = dimensions.height * scale
        room(height + 30)
        const y = doc.y
        doc.image(buffer, doc.page.margins.left, y, { width, height })
        doc.x = doc.page.margins.left
        doc.y = y + height + 10
        // Milkdown encode le ratio dans alt et la légende dans title.
        const caption =
          token.title || (/^\d+(?:\.\d+)?$/.test(token.text) ? '' : token.text)
        if (caption) line(caption, 9)
      }
      const renderInline = (tokens: Token[] | undefined, fallback: string) => {
        if (!tokens?.length) {
          line(fallback)
          return
        }
        let text = ''
        const flush = () => {
          if (text.trim()) line(text)
          text = ''
        }
        const visit = (items: Token[]) => {
          for (const token of items) {
            if (token.type === 'image') {
              flush()
              renderImage(token as Tokens.Image)
            } else if ('tokens' in token && Array.isArray(token.tokens))
              visit(token.tokens)
            else text += plain([token])
          }
        }
        visit(tokens)
        flush()
      }
      const renderPlot = (source: string) => {
        const config = parsePlot(source),
          g = plotGeometry(config)
        const scale = (doc.page.width - 96) / PLOT_WIDTH
        const height = PLOT_HEIGHT * scale
        room(height + 12)
        const y = doc.y
        doc.save().translate(48, y).scale(scale)
        doc.rect(0, 0, PLOT_WIDTH, PLOT_HEIGHT).fill('#ffffff')
        const stroke = (
          x1: number,
          y1: number,
          x2: number,
          y2: number,
          color: string,
        ) => doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(0.7).stroke(color)
        doc
          .font('regular')
          .fontSize(14)
          .fillColor('#0f172a')
          .text(config.title, 58, 10, { width: 560, lineBreak: false })
        for (const t of g.xTicks) {
          stroke(t.position, g.top, t.position, g.top + g.height, '#e2e8f0')
          doc
            .fontSize(10)
            .fillColor('#475569')
            .text(String(t.value), t.position - 20, 346, {
              width: 40,
              align: 'center',
              lineBreak: false,
            })
        }
        for (const t of g.yTicks) {
          stroke(g.left, t.position, g.left + g.width, t.position, '#e2e8f0')
          doc
            .fontSize(10)
            .fillColor('#475569')
            .text(String(t.value), 0, t.position - 6, {
              width: 50,
              align: 'right',
              lineBreak: false,
            })
        }
        if (g.zeroX !== null)
          stroke(g.zeroX, g.top, g.zeroX, g.top + g.height, '#64748b')
        if (g.zeroY !== null)
          stroke(g.left, g.zeroY, g.left + g.width, g.zeroY, '#64748b')
        doc
          .rect(g.left, g.top, g.width, g.height)
          .lineWidth(0.7)
          .stroke('#94a3b8')
        for (const [i, curve] of g.curves.entries()) {
          for (const points of curve.segments) {
            if (points.length < 2) continue
            doc.moveTo(points[0]![0], points[0]![1])
            for (const p of points.slice(1)) doc.lineTo(p[0], p[1])
            doc.lineWidth(1.8).stroke(curve.color)
          }
          doc
            .fontSize(11)
            .fillColor(curve.color)
            .text(curve.expression, 58, 374 + i * 13, {
              width: 560,
              lineBreak: false,
            })
        }
        doc.restore()
        doc.x = 48
        doc.y = y + height + 12
      }
      const render = (tokens: Token[], depth = 0) => {
        if (depth > 30) throw new HttpError(413, 'Markdown trop imbriqué')
        for (const token of tokens) {
          switch (token.type) {
            case 'heading':
              line(
                plain(token.tokens, token.text),
                Math.max(11, 24 - token.depth * 2),
                'bold',
              )
              break
            case 'paragraph':
            case 'text':
              renderInline(token.tokens, token.text)
              break
            case 'image':
              renderImage(token as Tokens.Image)
              break
            case 'code':
              if (token.lang?.trim().toLowerCase() === 'plot') {
                try {
                  renderPlot(token.text)
                } catch {
                  line('Bloc de fonctions invalide ; source conservée :')
                  line(token.text, 9, 'mono')
                }
              } else line(token.text, 9, 'mono')
              break
            case 'blockquote':
              render(token.tokens ?? [], depth + 1)
              break
            case 'list':
              ;(token as Tokens.List).items.forEach((item, i) => {
                line(
                  `${token.ordered ? `${Number(token.start) + i}.` : '•'} ${item.task ? (item.checked ? '[x] ' : '[ ] ') : ''}`,
                )
                render(item.tokens, depth + 1)
              })
              break
            // Tables présentées en blocs par ligne pour éviter les colonnes tronquées.
            case 'table':
              line(
                (token as Tokens.Table).header
                  .map((c) => plain(c.tokens, c.text))
                  .join(' | '),
                10,
                'bold',
              )
              ;(token as Tokens.Table).rows.forEach((row) =>
                line(row.map((c) => plain(c.tokens, c.text)).join(' | ')),
              )
              break
            case 'html':
              if (/^(?:\s*<br\s*\/?\s*>\s*)+$/i.test(token.raw))
                doc.moveDown(0.3)
              else line(token.raw)
              break // code source visible, jamais interprété
            case 'hr':
              line('────────────────────────────', 9)
              break
            case 'space':
              doc.moveDown(0.3)
              break
          }
        }
      }
      if (Buffer.byteLength(chapter.content_md) > 1024 * 1024)
        throw new HttpError(413, 'Chapitre trop volumineux pour le PDF (1 Mio)')
      render(marked.lexer(markdown(chapter)))
      doc.end()
    } catch (err) {
      ;(doc as unknown as Readable).destroy()
      reject(err)
    }
  })
}
