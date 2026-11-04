import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { pool, withTx } from '../db/pool.js'
import { HttpError } from '../errors.js'
import { uid } from '../middleware/auth.js'
import { ah, idSchema } from './crud.js'
import { memoryRows } from '../services/reviews.js'
import {
  DAY_MS,
  REVIEW_MODEL,
  REVIEW_RATINGS,
  nextStability,
  localDay,
  shiftDay,
} from '../../../shared/reviewModel.js'
export const reviewsRouter = Router()
const timezone = z
  .string()
  .max(80)
  .default('UTC')
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value })
      return true
    } catch {
      return false
    }
  }, 'Fuseau horaire invalide')
const query = z
  .object({
    timezone,
    evaluation_id: idSchema.optional(),
    subject_id: idSchema.optional(),
    scope: z.enum(['today', 'all']).default('today'),
    offset: z.coerce.number().int().min(0).max(100000).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
const limiter = rateLimit({
  windowMs: 3600000,
  limit: 120,
  keyGenerator: (req) => uid(req),
  standardHeaders: true,
  legacyHeaders: false,
})
reviewsRouter.get(
  '/reviews',
  ah(async (req, res) => {
    const q = query.parse(req.query),
      user = uid(req),
      now = new Date()
    if (q.evaluation_id) {
      const owned = await pool.query(
        'SELECT id FROM evaluations WHERE id=$1 AND user_id=$2',
        [q.evaluation_id, user],
      )
      if (!owned.rows.length) throw new HttpError(404, 'Évaluation introuvable')
    }
    if (q.subject_id) {
      const owned = await pool.query(
        'SELECT id FROM subjects WHERE id=$1 AND user_id=$2',
        [q.subject_id, user],
      )
      if (!owned.rows.length) throw new HttpError(404, 'Matière introuvable')
    }
    const rows = await memoryRows(user, now, q.timezone, q)
    const soon = shiftDay(localDay(now, q.timezone), 7)
    const examPriority = (day: string | null) =>
      day && day <= soon ? day : '9999'
    rows.sort(
      (a, b) =>
        Number(b.memory.due_now) - Number(a.memory.due_now) ||
        examPriority(a.evaluation_date).localeCompare(
          examPriority(b.evaluation_date),
        ) ||
        (a.memory.due_day ?? '9999').localeCompare(
          b.memory.due_day ?? '9999',
        ) ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id),
    )
    const selected =
      q.scope === 'today' ? rows.filter((row) => row.memory.due_today) : rows
    res.set('Cache-Control', 'no-store').json({
      items: selected.slice(q.offset, q.offset + q.limit),
      total: selected.length,
      counts: {
        today: rows.filter((row) => row.memory.due_today).length,
        now: rows.filter((row) => row.memory.due_now).length,
        unstarted: rows.filter((row) => !row.memory.active).length,
      },
      computed_at: now.toISOString(),
      today: localDay(now, q.timezone),
      timezone: q.timezone,
      model: REVIEW_MODEL,
    })
  }),
)
reviewsRouter.get(
  '/chapters/:id/reviews',
  ah(async (req, res) => {
    const id = idSchema.parse(req.params.id),
      user = uid(req),
      tz = z.object({ timezone }).strict().parse(req.query).timezone
    const result = await withTx(async (client) => {
      await client.query(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      )
      const now = new Date(),
        rows = await memoryRows(user, now, tz, { chapter_id: id }, client)
      if (!rows[0]) throw new HttpError(404, 'Chapitre introuvable')
      const history = await client.query(
        'SELECT id,reviewed_at,rating,stability_days,ordinal,model_version FROM reviews WHERE user_id=$1 AND chapter_id=$2 ORDER BY ordinal DESC LIMIT 50',
        [user, id],
      )
      return {
        chapter: rows[0],
        history: history.rows,
        computed_at: now.toISOString(),
        timezone: tz,
        model: REVIEW_MODEL,
      }
    })
    res.set('Cache-Control', 'no-store').json(result)
  }),
)
reviewsRouter.post(
  '/chapters/:id/reviews',
  limiter,
  ah(async (req, res) => {
    const chapterId = idSchema.parse(req.params.id),
      user = uid(req)
    const body = z
      .object({ id: idSchema, rating: z.enum(REVIEW_RATINGS) })
      .strict()
      .parse(req.body)
    const result = await withTx(async (client) => {
      const owned = await client.query(
        'SELECT id,status,review_started_at,initial_stability_days FROM chapters WHERE id=$1 AND user_id=$2 FOR UPDATE',
        [chapterId, user],
      )
      const chapter = owned.rows[0]
      if (!chapter) throw new HttpError(404, 'Chapitre introuvable')
      const exists = await client.query('SELECT * FROM reviews WHERE id=$1', [
        body.id,
      ])
      if (exists.rows[0]) {
        const row = exists.rows[0]
        if (
          row.user_id !== user ||
          row.chapter_id !== chapterId ||
          row.rating !== body.rating
        )
          throw new HttpError(409, 'Identifiant de révision déjà utilisé')
        return { review: row, status: chapter.status, replayed: true }
      }
      const latest = await client.query(
        'SELECT reviewed_at,stability_days,ordinal FROM reviews WHERE chapter_id=$1 AND user_id=$2 ORDER BY ordinal DESC LIMIT 1',
        [chapterId, user],
      )
      const previous = latest.rows[0],
        now = new Date(),
        anchor = previous?.reviewed_at ?? chapter.review_started_at
      const stability = nextStability(
        previous?.stability_days ?? chapter.initial_stability_days,
        anchor
          ? Math.max(0, (now.getTime() - new Date(anchor).getTime()) / DAY_MS)
          : 0,
        body.rating,
      )
      const { rows } = await client.query(
        'INSERT INTO reviews(id,user_id,chapter_id,reviewed_at,rating,stability_days,ordinal) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [
          body.id,
          user,
          chapterId,
          now.toISOString(),
          body.rating,
          stability,
          (previous?.ordinal ?? 0) + 1,
        ],
      )
      const status =
        body.rating !== 'again'
          ? 'revised'
          : chapter.status === 'not_started'
            ? 'seen'
            : chapter.status
      await client.query(
        'UPDATE chapters SET status=$1 WHERE id=$2 AND user_id=$3',
        [status, chapterId, user],
      )
      return { review: rows[0], status, replayed: false }
    }).catch((error: unknown) => {
      if ((error as { code?: string }).code === '23505')
        throw new HttpError(409, 'Identifiant de révision déjà utilisé')
      throw error
    })
    res
      .set('Cache-Control', 'no-store')
      .status(result.replayed ? 200 : 201)
      .json(result)
  }),
)
