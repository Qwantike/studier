import { Router } from 'express'
import { z } from 'zod'
import { pool, withTx } from '../db/pool.js'
import { HttpError } from '../errors.js'
import { uid } from '../middleware/auth.js'
import { ah } from './crud.js'
import {
  ACCOUNT_LIMIT,
  BOARD_LIMIT,
  SCENE_LIMIT,
  emptyScene,
  parseScene,
  translateBoardError,
} from '../services/whiteboards.js'

export const whiteboardsRouter = Router()
const uuid = z.string().uuid()
const title = z.string().trim().min(1).max(200)
const parentSchema = z
  .object({ subject_id: uuid.optional(), chapter_id: uuid.optional() })
  .strict()
const createSchema = z
  .object({
    title,
    subject_id: uuid.optional(),
    chapter_id: uuid.optional(),
    scene: z.unknown().optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.subject_id) !== Boolean(v.chapter_id),
    'Choisissez une matière ou un chapitre',
  )
const updateSchema = z
  .object({
    title: title.optional(),
    scene: z.unknown().optional(),
    revision: z.number().int().positive(),
  })
  .strict()
  .refine(
    (v) => v.title !== undefined || v.scene !== undefined,
    'Modification vide',
  )
const metadata =
  'id, user_id, subject_id, chapter_id, title, scene_bytes, revision, created_at, updated_at'

whiteboardsRouter.get(
  '/usage',
  ah(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT COALESCE(sum(scene_bytes), 0)::integer AS bytes, count(*)::integer AS count FROM whiteboards WHERE user_id = $1',
      [uid(req)],
    )
    res.json({
      ...rows[0],
      scene_limit: SCENE_LIMIT,
      account_limit: ACCOUNT_LIMIT,
      board_limit: BOARD_LIMIT,
    })
  }),
)
whiteboardsRouter.get(
  '/',
  ah(async (req, res) => {
    const scope = parentSchema.parse(req.query)
    if (scope.subject_id && scope.chapter_id)
      throw new HttpError(400, 'Choisissez un seul filtre')
    const params = [uid(req)]
    let where = 'user_id = $1'
    if (scope.subject_id || scope.chapter_id) {
      params.push((scope.subject_id ?? scope.chapter_id)!)
      where += ` AND ${scope.subject_id ? 'subject_id' : 'chapter_id'} = $2`
    }
    const { rows } = await pool.query(
      `SELECT ${metadata} FROM whiteboards WHERE ${where} ORDER BY updated_at DESC, id`,
      params,
    )
    res.set('Cache-Control', 'no-store').json(rows)
  }),
)
whiteboardsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${metadata}, scene FROM whiteboards WHERE id = $1 AND user_id = $2`,
      [uuid.parse(req.params.id), uid(req)],
    )
    if (!rows[0]) throw new HttpError(404, 'Tableau introuvable')
    res.set('Cache-Control', 'no-store').json(rows[0])
  }),
)
whiteboardsRouter.post(
  '/',
  ah(async (req, res) => {
    const input = createSchema.parse(req.body)
    const scene = parseScene(input.scene ?? emptyScene())
    const user = uid(req)
    try {
      const board = await withTx(async (client) => {
        await client.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED')
        await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [
          user,
        ])
        const parent = await client.query(
          `SELECT id FROM ${input.subject_id ? 'subjects' : 'chapters'} WHERE id = $1 AND user_id = $2`,
          [input.subject_id ?? input.chapter_id, user],
        )
        if (!parent.rows.length) throw new HttpError(404, 'Parent introuvable')
        const { rows } = await client.query(
          `INSERT INTO whiteboards (user_id, subject_id, chapter_id, title, scene) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING ${metadata}, scene`,
          [
            user,
            input.subject_id ?? null,
            input.chapter_id ?? null,
            input.title,
            JSON.stringify(scene),
          ],
        )
        return rows[0]
      })
      res.status(201).json(board)
    } catch (err) {
      translateBoardError(err)
    }
  }),
)
whiteboardsRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const id = uuid.parse(req.params.id),
      user = uid(req)
    const input = updateSchema.parse(req.body)
    const scene =
      input.scene === undefined ? undefined : parseScene(input.scene)
    try {
      const board = await withTx(async (client) => {
        await client.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED')
        await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [
          user,
        ])
        const current = await client.query(
          'SELECT revision FROM whiteboards WHERE id = $1 AND user_id = $2 FOR UPDATE',
          [id, user],
        )
        if (!current.rows[0]) throw new HttpError(404, 'Tableau introuvable')
        if (current.rows[0].revision !== input.revision)
          throw new HttpError(
            409,
            'Ce tableau a été modifié ailleurs. Téléchargez votre brouillon JSON avant de recharger la version serveur.',
          )
        const { rows } = await client.query(
          `UPDATE whiteboards SET title = COALESCE($3, title), scene = COALESCE($4::jsonb, scene) WHERE id = $1 AND user_id = $2 AND revision = $5 RETURNING ${metadata}`,
          [
            id,
            user,
            input.title ?? null,
            scene === undefined ? null : JSON.stringify(scene),
            input.revision,
          ],
        )
        return rows[0]
      })
      res.json(board)
    } catch (err) {
      translateBoardError(err)
    }
  }),
)
whiteboardsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const id = uuid.parse(req.params.id),
      user = uid(req)
    const revision = z.coerce
      .number()
      .int()
      .positive()
      .parse(req.query.revision)
    await withTx(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED')
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [
        user,
      ])
      const { rows } = await client.query(
        'SELECT revision FROM whiteboards WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [id, user],
      )
      if (!rows[0]) throw new HttpError(404, 'Tableau introuvable')
      if (rows[0].revision !== revision)
        throw new HttpError(
          409,
          'Tableau modifié ailleurs : actualisez la liste avant de supprimer.',
        )
      await client.query(
        'DELETE FROM whiteboards WHERE id = $1 AND user_id = $2',
        [id, user],
      )
    })
    res.status(204).end()
  }),
)
