import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../errors.js'
import { uid } from '../middleware/auth.js'
import { readSnapshot } from '../services/export/data.js'
import { archive, sqlite } from '../services/export/archive.js'
import { markdown, pdf, slug } from '../services/export/documents.js'

export const exportsRouter = Router()
const requestSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('selection'),
      formats: z
        .array(z.enum(['md', 'pdf']))
        .min(1)
        .max(2),
      roots: z
        .array(
          z
            .object({
              level: z.enum(['years', 'semesters', 'subjects', 'chapters']),
              id: z.string().uuid(),
            })
            .strict(),
        )
        .min(1)
        .max(5000),
    })
    .strict(),
  z
    .object({ kind: z.literal('complete'), format: z.enum(['zip', 'db']) })
    .strict(),
])
const active = new Set<string>()
function reserve(user: string) {
  if (active.has(user) || active.size >= 2)
    throw new HttpError(
      429,
      'Un export est déjà en cours. Réessayez dans quelques instants.',
    )
  active.add(user)
  return () => active.delete(user)
}
function headers(res: import('express').Response, name: string, type: string) {
  res.set({
    'Content-Type': type,
    'Content-Disposition': `attachment; filename="${name}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
}
exportsRouter.get('/chapters/:id/:format', async (req, res, next) => {
  let release: (() => void) | undefined
  try {
    const chapterId = z.string().uuid().parse(req.params.id)
    const format = z.enum(['md', 'pdf']).parse(req.params.format)
    const user = uid(req)
    release = reserve(user)
    const data = await readSnapshot(user, undefined, [
      { level: 'chapters', id: chapterId },
    ])
    const row = data.tables.chapters.find((c) => c.id === chapterId)
    if (!row) throw new HttpError(404, 'Chapitre introuvable')
    const chapter = {
      title: String(row.title),
      content_md: String(row.content_md),
    }
    const result =
      format === 'md' ? Buffer.from(markdown(chapter)) : await pdf(chapter)
    headers(
      res,
      `${slug(chapter.title)}.${format}`,
      format === 'md' ? 'text/markdown; charset=utf-8' : 'application/pdf',
    )
    res.send(result)
  } catch (err) {
    next(err)
  } finally {
    release?.()
  }
})
exportsRouter.post('/', async (req, res, next) => {
  let release: (() => void) | undefined
  try {
    const input = requestSchema.parse(req.body)
    const user = uid(req)
    release = reserve(user)
    const data = await readSnapshot(
      user,
      undefined,
      input.kind === 'selection' ? input.roots : undefined,
    )
    const isDb = input.kind === 'complete' && input.format === 'db'
    const result = isDb
      ? await sqlite(data)
      : input.kind === 'selection'
        ? await archive(data, [...new Set(input.formats)], input.roots)
        : await archive(data, ['md', 'pdf'], undefined, true)
    headers(
      res,
      `studier-${input.kind}-${data.exported_at.slice(0, 10)}.${isDb ? 'db' : 'zip'}`,
      isDb ? 'application/vnd.sqlite3' : 'application/zip',
    )
    res.send(result)
  } catch (err) {
    next(err)
  } finally {
    release?.()
  }
})
