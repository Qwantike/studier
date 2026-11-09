import { Router } from 'express'
import { z } from 'zod'
import { withTx } from '../db/pool.js'
import { uid } from '../middleware/auth.js'
import { ah } from './crud.js'
import {
  summarizeStudy,
  type StudyPreferences,
  type StudySubject,
} from '../../../shared/studyActivity.js'
export const studyRouter = Router()
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
studyRouter.get(
  '/study',
  ah(async (req, res) => {
    const q = z.object({ timezone }).strict().parse(req.query)
    const user = uid(req)
    const data = await withTx(async (db) => {
      await db.query(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      )
      const now = new Date()
      const prefs = await db.query<StudyPreferences>(
        'SELECT enabled,weekly_days FROM study_preferences WHERE user_id=$1',
        [user],
      )
      const preferences = prefs.rows[0] ?? { enabled: false, weekly_days: 3 }
      // Masquer évite aussi le chargement des statistiques et de l'historique.
      if (!preferences.enabled) return { preferences }
      const days = await db.query<{ day: string; count: number }>(
        `SELECT to_char(occurred_at AT TIME ZONE $2,'YYYY-MM-DD') AS day, count(*)::int AS count
       FROM study_activity WHERE user_id=$1 AND occurred_at <= $3 GROUP BY day ORDER BY day`,
        [user, q.timezone, now],
      )
      const subjects = await db.query<StudySubject>(
        `SELECT s.id,s.name,count(c.id)::int AS total,
       count(c.id) FILTER (WHERE c.status='revised')::int AS revised,
       count(c.id) FILTER (WHERE EXISTS(SELECT 1 FROM study_activity a WHERE a.user_id=$1 AND a.chapter_id=c.id AND a.occurred_at <= $2))::int AS reviewed
       FROM subjects s LEFT JOIN chapters c ON c.subject_id=s.id AND c.user_id=s.user_id
       WHERE s.user_id=$1 GROUP BY s.id ORDER BY s.name,s.id`,
        [user, now],
      )
      const recent = await db.query(
        `SELECT a.id,a.chapter_id,a.occurred_at,c.title,s.name AS subject_name
       FROM study_activity a JOIN chapters c ON c.id=a.chapter_id AND c.user_id=a.user_id
       JOIN subjects s ON s.id=c.subject_id AND s.user_id=c.user_id
       WHERE a.user_id=$1 AND a.occurred_at <= $2 ORDER BY a.occurred_at DESC,a.id LIMIT 20`,
        [user, now],
      )
      return {
        preferences,
        ...summarizeStudy(
          days.rows.map((r) => r.day),
          days.rows.reduce((sum, r) => sum + r.count, 0),
          now,
          q.timezone,
        ),
        subjects: subjects.rows,
        recent: recent.rows,
      }
    })
    res.set('Cache-Control', 'no-store').json(data)
  }),
)
studyRouter.patch(
  '/study/preferences',
  ah(async (req, res) => {
    const body = z
      .object({
        enabled: z.boolean().optional(),
        weekly_days: z.number().int().min(1).max(7).optional(),
      })
      .strict()
      .refine((v) => Object.keys(v).length > 0)
      .parse(req.body)
    const user = uid(req)
    const result = await withTx(async (db) =>
      db.query<StudyPreferences>(
        `INSERT INTO study_preferences(id,user_id,enabled,weekly_days) VALUES($1,$1,COALESCE($2,false),COALESCE($3,3))
     ON CONFLICT(user_id) DO UPDATE SET enabled=COALESCE($2,study_preferences.enabled),weekly_days=COALESCE($3,study_preferences.weekly_days)
     RETURNING enabled,weekly_days`,
        [user, body.enabled ?? null, body.weekly_days ?? null],
      ),
    )
    res.set('Cache-Control', 'no-store').json(result.rows[0])
  }),
)
