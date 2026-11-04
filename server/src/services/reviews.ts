import type { Pool, PoolClient } from 'pg'
import { pool } from '../db/pool.js'
import { HttpError } from '../errors.js'
import {
  estimateMemory,
  localDay,
  type MemoryInput,
} from '../../../shared/reviewModel.js'
export interface MemoryRow extends MemoryInput {
  id: string
  title: string
  subject_id: string
  subject_name: string
  subject_color: string
  evaluation_id: string | null
  evaluation_title: string | null
  year_label: string
  semester_label: string
}
type Queryable = Pick<Pool | PoolClient, 'query'>
export async function memoryRows(
  user: string,
  now: Date,
  timezone: string,
  filter: {
    chapter_id?: string
    evaluation_id?: string
    subject_id?: string
  } = {},
  db: Queryable = pool,
) {
  const args: unknown[] = [user, localDay(now, timezone)],
    where = ['c.user_id=$1']
  if (filter.chapter_id) {
    args.push(filter.chapter_id)
    where.push(`c.id=$${args.length}`)
  }
  if (filter.subject_id) {
    args.push(filter.subject_id)
    where.push(`c.subject_id=$${args.length}`)
  }
  if (filter.evaluation_id) {
    args.push(filter.evaluation_id)
    where.push(
      `EXISTS(SELECT 1 FROM evaluation_chapters ec WHERE ec.user_id=c.user_id AND ec.chapter_id=c.id AND ec.evaluation_id=$${args.length})`,
    )
  }
  const { rows } = await db.query<MemoryRow>(
    `SELECT c.id,c.title,c.status,c.subject_id,c.review_started_at,c.initial_stability_days,s.name AS subject_name,s.color AS subject_color,y.label AS year_label,se.label AS semester_label,
    r.reviewed_at AS last_reviewed_at,r.stability_days,COALESCE(r.ordinal,0) AS review_count,
    e.id AS evaluation_id,e.title AS evaluation_title,e.date AS evaluation_date
    FROM chapters c JOIN subjects s ON s.id=c.subject_id AND s.user_id=c.user_id
    JOIN semesters se ON se.id=s.semester_id AND se.user_id=c.user_id JOIN years y ON y.id=se.year_id AND y.user_id=c.user_id
    LEFT JOIN LATERAL(SELECT reviewed_at,stability_days,ordinal FROM reviews WHERE user_id=c.user_id AND chapter_id=c.id ORDER BY ordinal DESC LIMIT 1) r ON true
    LEFT JOIN LATERAL(SELECT ev.id,ev.title,ev.date FROM evaluations ev JOIN evaluation_chapters ec ON ec.evaluation_id=ev.id AND ec.user_id=ev.user_id WHERE ec.chapter_id=c.id AND ec.user_id=c.user_id AND ev.date >= $2::date ORDER BY ev.date,ev.id LIMIT 1) e ON true
    WHERE ${where.join(' AND ')} ORDER BY c.id LIMIT 5001`,
    args,
  )
  if (rows.length > 5000)
    throw new HttpError(
      413,
      'Plus de 5 000 chapitres : filtrez par matière ou évaluation.',
    )
  // Normaliser les timestamptz pour un calcul et une réponse identiques partout.
  return (JSON.parse(JSON.stringify(rows)) as MemoryRow[]).map((row) => ({
    ...row,
    memory: estimateMemory(row, now, timezone),
  }))
}
