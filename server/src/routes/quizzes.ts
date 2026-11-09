import { createHash } from 'node:crypto'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { pool, withTx } from '../db/pool.js'
import { env } from '../config.js'
import { HttpError } from '../errors.js'
import { uid } from '../middleware/auth.js'
import { ah, idSchema } from './crud.js'
import {
  generateQuiz,
  quizCourse,
  QUIZ_SOURCE_LIMIT,
} from '../services/quizProvider.js'
import { DIFFICULTIES } from '../../../shared/quizzes.js'
export const quizzesRouter = Router()
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const generateBody = z
  .object({
    id: idSchema,
    difficulty: z.enum(DIFFICULTIES),
    example: z.string().trim().max(2000).default(''),
    consent: z.literal(true),
  })
  .strict()
const attemptBody = z
  .object({
    id: idSchema,
    answers: z.record(idSchema, z.number().int().min(0).max(3)),
  })
  .strict()
const dayStart =
  "(date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')"
const publicColumns = `q.id,q.chapter_id,q.chapter_title,q.difficulty,q.created_at,CASE WHEN r.status='generating' AND r.created_at < now()-interval '2 minutes' THEN 'failed' ELSE r.status END AS status`
async function detail(user: string, id: string) {
  return withTx(async (db) => {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const quiz = await db.query(
      `SELECT ${publicColumns} FROM quizzes q JOIN quiz_generation_requests r ON r.id=q.id AND r.user_id=q.user_id WHERE q.id=$1 AND q.user_id=$2`,
      [id, user],
    )
    if (!quiz.rows[0]) throw new HttpError(404, 'QCM introuvable')
    const questions = await db.query(
      'SELECT id,position,prompt,options FROM questions WHERE quiz_id=$1 AND user_id=$2 ORDER BY position',
      [id, user],
    )
    const attempts = await db.query(
      'SELECT id,score,total,created_at FROM attempts WHERE quiz_id=$1 AND user_id=$2 ORDER BY created_at DESC,id LIMIT 20',
      [id, user],
    )
    return {
      ...quiz.rows[0],
      questions: questions.rows,
      attempts: attempts.rows,
    }
  })
}
quizzesRouter.get(
  '/quizzes/config',
  ah(async (req, res) => {
    const count = await pool.query(
      `SELECT count(*)::int AS used FROM quiz_generation_requests WHERE user_id=$1 AND created_at >= ${dayStart}`,
      [uid(req)],
    )
    res.set('Cache-Control', 'no-store').json({
      enabled: !!env.OPENAI_API_KEY.trim(),
      daily_limit: env.QUIZ_DAILY_LIMIT,
      remaining_today: Math.max(0, env.QUIZ_DAILY_LIMIT - count.rows[0].used),
      provider: 'OpenAI',
      max_source_chars: QUIZ_SOURCE_LIMIT,
    })
  }),
)
quizzesRouter.get(
  '/chapters/:id/quizzes',
  ah(async (req, res) => {
    const chapter = idSchema.parse(req.params.id),
      user = uid(req)
    if (
      !(
        await pool.query('SELECT id FROM chapters WHERE id=$1 AND user_id=$2', [
          chapter,
          user,
        ])
      ).rows.length
    )
      throw new HttpError(404, 'Chapitre introuvable')
    const rows = await pool.query(
      `SELECT ${publicColumns} FROM quizzes q JOIN quiz_generation_requests r ON r.id=q.id AND r.user_id=q.user_id WHERE q.chapter_id=$1 AND q.user_id=$2 ORDER BY q.created_at DESC,q.id LIMIT 20`,
      [chapter, user],
    )
    res.set('Cache-Control', 'no-store').json(rows.rows)
  }),
)
quizzesRouter.get(
  '/quizzes/:id',
  ah(async (req, res) => {
    res
      .set('Cache-Control', 'no-store')
      .json(await detail(uid(req), idSchema.parse(req.params.id)))
  }),
)
quizzesRouter.post(
  '/chapters/:id/quizzes',
  ah(async (req, res) => {
    const chapter = idSchema.parse(req.params.id),
      user = uid(req),
      body = generateBody.parse(req.body)
    const requestHash = hash(
      JSON.stringify({
        chapter,
        difficulty: body.difficulty,
        example: body.example,
      }),
    )
    const reservation = await withTx(async (db) => {
      // Verrou partagé par toutes les instances de l'API : quotas et réservation atomiques.
      await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user])
      const source = await db.query(
        'SELECT title,content_md FROM chapters WHERE id=$1 AND user_id=$2',
        [chapter, user],
      )
      if (!source.rows[0]) throw new HttpError(404, 'Chapitre introuvable')
      const previous = await db.query(
        'SELECT user_id FROM quiz_generation_requests WHERE id=$1',
        [body.id],
      )
      if (previous.rows[0]) {
        const quiz = await db.query(
          'SELECT request_hash FROM quizzes WHERE id=$1 AND user_id=$2',
          [body.id, user],
        )
        if (
          previous.rows[0].user_id !== user ||
          quiz.rows[0]?.request_hash !== requestHash
        )
          throw new HttpError(
            409,
            'Identifiant de demande déjà utilisé ou demande supprimée',
          )
        return { fresh: false, course: '' }
      }
      if (!env.OPENAI_API_KEY.trim())
        throw new HttpError(
          503,
          'La génération de QCM est désactivée sur ce serveur',
        )
      const course = quizCourse(source.rows[0].content_md)
      if (course.length < 80)
        throw new HttpError(
          400,
          'Le chapitre doit contenir au moins 80 caractères de cours',
        )
      if (course.length > QUIZ_SOURCE_LIMIT)
        throw new HttpError(
          413,
          `Le chapitre dépasse ${QUIZ_SOURCE_LIMIT} caractères ; réduisez-le avant de générer un QCM`,
        )
      await db.query(
        "UPDATE quiz_generation_requests SET status='failed' WHERE user_id=$1 AND status='generating' AND created_at < now()-interval '2 minutes'",
        [user],
      )
      const counts = await db.query(
        `SELECT count(*) FILTER(WHERE created_at >= ${dayStart})::int AS daily,
      count(*) FILTER(WHERE created_at > now()-interval '1 minute')::int AS recent,
      count(*) FILTER(WHERE status='generating')::int AS pending FROM quiz_generation_requests WHERE user_id=$1`,
        [user],
      )
      const count = counts.rows[0]
      if (count.daily >= env.QUIZ_DAILY_LIMIT)
        throw new HttpError(
          429,
          'Quota journalier atteint. Réinitialisation à minuit UTC.',
        )
      if (count.recent >= env.QUIZ_PER_MINUTE)
        throw new HttpError(
          429,
          'Limite de génération par minute atteinte. Patientez avant une nouvelle demande.',
        )
      if (count.pending > 0)
        throw new HttpError(
          409,
          'Une génération est déjà en cours pour ce compte',
        )
      await db.query(
        'INSERT INTO quiz_generation_requests(id,user_id) VALUES($1,$2)',
        [body.id, user],
      )
      await db.query(
        'INSERT INTO quizzes(id,user_id,chapter_id,chapter_title,difficulty,request_hash,source_hash,model) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          body.id,
          user,
          chapter,
          source.rows[0].title,
          body.difficulty,
          requestHash,
          hash(course),
          env.QUIZ_MODEL,
        ],
      )
      return { fresh: true, course }
    }).catch((error: unknown) => {
      if ((error as { code?: string }).code === '23505')
        throw new HttpError(409, 'Identifiant de demande déjà utilisé')
      throw error
    })
    if (reservation.fresh) {
      try {
        const quiz = await generateQuiz(
          reservation.course,
          body.difficulty,
          body.example,
        )
        await withTx(async (db) => {
          const exists = await db.query(
            'SELECT id FROM quizzes WHERE id=$1 AND user_id=$2 FOR UPDATE',
            [body.id, user],
          )
          if (!exists.rows.length)
            throw new HttpError(
              404,
              'Le chapitre ou le QCM a été supprimé pendant la génération',
            )
          const ready = await db.query(
            "UPDATE quiz_generation_requests SET status='ready' WHERE id=$1 AND user_id=$2 AND status='generating' AND created_at > now()-interval '2 minutes' RETURNING id",
            [body.id, user],
          )
          if (!ready.rows.length)
            throw new HttpError(
              409,
              'La demande a expiré ; son résultat ne peut plus être enregistré',
            )
          for (const [position, q] of quiz.questions.entries())
            await db.query(
              'INSERT INTO questions(user_id,quiz_id,position,prompt,options,correct_index,explanation) VALUES($1,$2,$3,$4,$5,$6,$7)',
              [
                user,
                body.id,
                position,
                q.prompt,
                JSON.stringify(q.options),
                q.correct_index,
                q.explanation,
              ],
            )
        })
      } catch (error) {
        await pool.query(
          "UPDATE quiz_generation_requests SET status='failed' WHERE id=$1 AND user_id=$2 AND status='generating'",
          [body.id, user],
        )
        if (error instanceof HttpError) throw error
        throw new HttpError(
          502,
          'La génération n’a pas pu être conservée. Cette demande ne sera pas relancée automatiquement.',
        )
      }
    }
    res
      .set('Cache-Control', 'no-store')
      .status(reservation.fresh ? 201 : 200)
      .json(await detail(user, body.id))
  }),
)
const attemptLimiter = rateLimit({
  windowMs: 60000,
  limit: 60,
  keyGenerator: (req) => uid(req),
  standardHeaders: true,
  legacyHeaders: false,
})
async function correction(user: string, id: string) {
  return withTx(async (db) => {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')

    const attempt = await db.query(
      'SELECT id,quiz_id,score,total,answers,created_at FROM attempts WHERE id=$1 AND user_id=$2',
      [id, user],
    )
    if (!attempt.rows[0]) throw new HttpError(404, 'Tentative introuvable')
    const a = attempt.rows[0]
    const questions = await db.query(
      'SELECT id,position,prompt,options,correct_index,explanation FROM questions WHERE quiz_id=$1 AND user_id=$2 ORDER BY position',
      [a.quiz_id, user],
    )
    return {
      id: a.id,
      score: a.score,
      total: a.total,
      created_at: a.created_at,
      questions: questions.rows.map((q) => ({
        ...q,
        selected_index: a.answers[q.id],
      })),
    }
  })
}
quizzesRouter.post(
  '/quizzes/:id/attempts',
  attemptLimiter,
  ah(async (req, res) => {
    const quiz = idSchema.parse(req.params.id),
      user = uid(req),
      body = attemptBody.parse(req.body)
    const answers = Object.fromEntries(
      Object.entries(body.answers).sort(([a], [b]) => a.localeCompare(b)),
    )
    const replay = await withTx(async (db) => {
      const owned = await db.query(
        `SELECT r.status FROM quizzes q JOIN quiz_generation_requests r ON r.id=q.id AND r.user_id=q.user_id WHERE q.id=$1 AND q.user_id=$2 FOR UPDATE OF q`,
        [quiz, user],
      )
      if (!owned.rows[0]) throw new HttpError(404, 'QCM introuvable')
      if (owned.rows[0].status !== 'ready')
        throw new HttpError(409, 'Ce QCM n’est pas prêt')
      const previous = await db.query(
        'SELECT user_id,quiz_id,answers FROM attempts WHERE id=$1',
        [body.id],
      )
      if (previous.rows[0]) {
        const p = previous.rows[0],
          canonical = Object.fromEntries(
            Object.entries(p.answers).sort(([a], [b]) => a.localeCompare(b)),
          )
        if (
          p.user_id !== user ||
          p.quiz_id !== quiz ||
          JSON.stringify(canonical) !== JSON.stringify(answers)
        )
          throw new HttpError(409, 'Identifiant de tentative déjà utilisé')
        return true
      }
      const questions = await db.query(
        'SELECT id,correct_index FROM questions WHERE quiz_id=$1 AND user_id=$2 ORDER BY position',
        [quiz, user],
      )
      if (questions.rows.length !== 5) throw new HttpError(409, 'QCM incomplet')
      if (
        Object.keys(answers).length !== 5 ||
        questions.rows.some((q) => answers[q.id] === undefined)
      )
        throw new HttpError(
          400,
          'Répondez exactement aux cinq questions de ce QCM',
        )
      const score = questions.rows.filter(
        (q) => answers[q.id] === q.correct_index,
      ).length
      await db.query(
        'INSERT INTO attempts(id,user_id,quiz_id,answers,score) VALUES($1,$2,$3,$4,$5)',
        [body.id, user, quiz, JSON.stringify(answers), score],
      )
      return false
    }).catch((error: unknown) => {
      if ((error as { code?: string }).code === '23505')
        throw new HttpError(409, 'Identifiant de tentative déjà utilisé')
      throw error
    })
    res
      .set('Cache-Control', 'no-store')
      .status(replay ? 200 : 201)
      .json(await correction(user, body.id))
  }),
)
quizzesRouter.get(
  '/quiz-attempts/:id',
  ah(async (req, res) => {
    res
      .set('Cache-Control', 'no-store')
      .json(await correction(uid(req), idSchema.parse(req.params.id)))
  }),
)
