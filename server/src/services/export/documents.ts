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
export function pdf(chapter: Chapter): Promise<Buffer> {
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
            if (token.type === 'br') return '\n'
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
              line(plain(token.tokens, token.text))
              break
            case 'code':
              line(token.text, 9, 'mono')
              break
            case 'blockquote':
              render(token.tokens ?? [], depth + 1)
              break
            case 'list':
              ;(token as Tokens.List).items.forEach((item, i) => {
                line(
                  `${token.ordered ? `${Number(token.start) + i}.` : '•'} ${item.task ? (item.checked ? '[x] ' : '[ ] ') : ''}${plain(item.tokens, item.text)}`,
                )
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
              line(token.raw)
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
