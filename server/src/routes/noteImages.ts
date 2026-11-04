import { Router, type RequestHandler } from 'express'
import multer from 'multer'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { pool, withTx } from '../db/pool.js'
import { HttpError } from '../errors.js'
import { uid } from '../middleware/auth.js'
import { ah } from './crud.js'
import {
  IMAGE_LIMIT,
  IMAGE_ACCOUNT_LIMIT,
  IMAGE_COUNT_LIMIT,
  normalizeImage,
} from '../services/noteImages.js'
export const noteImagesRouter = Router()
const uuid = z.string().uuid()
const metadata =
  'id, original_name, mime_type, width, height, byte_size, created_at'
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_LIMIT, files: 1, fields: 0, parts: 2 },
}).single('image')
const receive: RequestHandler = (req, res, next) =>
  upload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError)
      return next(
        new HttpError(
          err.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Image trop volumineuse : maximum 4 Mio.'
            : 'Envoyez un seul fichier dans le champ image.',
        ),
      )
    next(err)
  })
const limiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  keyGenerator: (req) => uid(req),
  standardHeaders: true,
  legacyHeaders: false,
})
noteImagesRouter.get(
  '/note-images',
  ah(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${metadata} FROM note_images WHERE user_id=$1 ORDER BY created_at DESC,id LIMIT 500`,
      [uid(req)],
    )
    res.set('Cache-Control', 'no-store').json(rows)
  }),
)
noteImagesRouter.get(
  '/note-images/usage',
  ah(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT COALESCE(sum(byte_size),0)::integer AS bytes,count(*)::integer AS count FROM note_images WHERE user_id=$1',
      [uid(req)],
    )
    res.set('Cache-Control', 'no-store').json({
      ...rows[0],
      image_limit: IMAGE_LIMIT,
      account_limit: IMAGE_ACCOUNT_LIMIT,
      count_limit: IMAGE_COUNT_LIMIT,
    })
  }),
)
noteImagesRouter.post(
  '/chapters/:chapterId/images',
  limiter,
  receive,
  ah(async (req, res) => {
    const chapterId = uuid.parse(req.params.chapterId),
      user = uid(req)
    const chapter = await pool.query(
      'SELECT id FROM chapters WHERE id=$1 AND user_id=$2',
      [chapterId, user],
    )
    if (!chapter.rows[0]) throw new HttpError(404, 'Chapitre introuvable')
    if (!req.file) throw new HttpError(400, 'Choisissez une image.')
    const image = await normalizeImage(req.file.buffer)
    try {
      const row = await withTx(async (client) => {
        await client.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED')
        await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
          user,
        ])
        const { rows } = await client.query(
          `INSERT INTO note_images(user_id,original_name,mime_type,width,height,data_base64) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${metadata}`,
          [
            user,
            [...req.file!.originalname]
              .filter((c) => c.charCodeAt(0) >= 32)
              .join('')
              .slice(0, 200) || 'image',
            image.mime_type,
            image.width,
            image.height,
            image.data.toString('base64'),
          ],
        )
        return rows[0]
      })
      res.status(201).json({ ...row, url: `/api/note-images/${row.id}` })
    } catch (error) {
      const e = error as { code?: string; message?: string }
      if (e.code === 'P0001' && e.message?.startsWith('note_image_'))
        throw new HttpError(
          413,
          'Quota des images atteint (4 Mio par image, 50 Mio et 500 images par compte). Supprimez les fichiers inutilisés dans Profil.',
        )
      throw error
    }
  }),
)
noteImagesRouter.get(
  '/note-images/:id',
  ah(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT mime_type,data_base64 FROM note_images WHERE id=$1 AND user_id=$2',
      [uuid.parse(req.params.id), uid(req)],
    )
    const image = rows[0]
    if (!image) throw new HttpError(404, 'Image introuvable')
    res
      .set({
        'Content-Type': image.mime_type,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `inline; filename="image.${image.mime_type === 'image/jpeg' ? 'jpg' : 'png'}"`,
      })
      .send(Buffer.from(image.data_base64, 'base64'))
  }),
)
noteImagesRouter.delete(
  '/note-images/:id',
  ah(async (req, res) => {
    const id = uuid.parse(req.params.id),
      user = uid(req)
    await withTx(async (client) => {
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user])
      const owned = await client.query(
        'SELECT id FROM note_images WHERE id=$1 AND user_id=$2',
        [id, user],
      )
      if (!owned.rows.length) throw new HttpError(404, 'Image introuvable')
      const used = await client.query(
        'SELECT id FROM chapters WHERE user_id=$1 AND content_md LIKE $2 LIMIT 1',
        [user, `%/api/note-images/${id}%`],
      )
      if (used.rows.length)
        throw new HttpError(
          409,
          'Cette image est encore référencée dans une note. Retirez-la des notes et enregistrez avant de supprimer le fichier.',
        )
      await client.query('DELETE FROM note_images WHERE id=$1 AND user_id=$2', [
        id,
        user,
      ])
    })
    res.status(204).end()
  }),
)
