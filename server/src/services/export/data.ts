import { REVIEW_MODEL } from '../../../../shared/reviewModel.js'
import { imageIds } from '../noteImages.js'
import type { Pool } from 'pg'
import { pool } from '../../db/pool.js'
import { HttpError } from '../../errors.js'

// Liste blanche commune à JSON et SQLite : jamais SELECT * sur les comptes/sessions.
const identity =
  'id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id)'
const dates = 'created_at TEXT NOT NULL, updated_at TEXT NOT NULL'
export const TABLES = {
  users: `id TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT NOT NULL, last_login_at TEXT, ${dates}`,
  years: `${identity}, label TEXT NOT NULL, position INTEGER NOT NULL, ${dates}`,
  semesters: `${identity}, year_id TEXT NOT NULL REFERENCES years(id), label TEXT NOT NULL, position INTEGER NOT NULL, ${dates}`,
  subjects: `${identity}, semester_id TEXT NOT NULL REFERENCES semesters(id), name TEXT NOT NULL, color TEXT NOT NULL, coefficient REAL, teacher TEXT, position INTEGER NOT NULL, ${dates}`,
  chapters: `${identity}, subject_id TEXT NOT NULL REFERENCES subjects(id), title TEXT NOT NULL, content_md TEXT NOT NULL, status TEXT NOT NULL, position INTEGER NOT NULL, review_started_at TEXT, initial_stability_days REAL, ${dates}`,
  reviews: `${identity}, chapter_id TEXT NOT NULL REFERENCES chapters(id), reviewed_at TEXT NOT NULL, rating TEXT NOT NULL, stability_days REAL NOT NULL, ordinal INTEGER NOT NULL, model_version INTEGER NOT NULL`,
  evaluations: `${identity}, subject_id TEXT NOT NULL REFERENCES subjects(id), title TEXT NOT NULL, type TEXT NOT NULL, date TEXT NOT NULL, coefficient REAL, grade REAL, ${dates}`,
  evaluation_chapters:
    'evaluation_id TEXT NOT NULL REFERENCES evaluations(id), chapter_id TEXT NOT NULL REFERENCES chapters(id), user_id TEXT NOT NULL REFERENCES users(id)',
  calendar_sources: `${identity}, name TEXT NOT NULL, url TEXT NOT NULL, last_synced_at TEXT, last_error TEXT, ${dates}, next_sync_at TEXT NOT NULL, failures INTEGER NOT NULL`,
  calendar_events: `${identity}, title TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, location TEXT, subject_id TEXT REFERENCES subjects(id), ics_uid TEXT, ${dates}, source_id TEXT REFERENCES calendar_sources(id)`,
  whiteboards: `${identity}, subject_id TEXT REFERENCES subjects(id), chapter_id TEXT REFERENCES chapters(id), title TEXT NOT NULL, scene TEXT NOT NULL, scene_bytes INTEGER NOT NULL, revision INTEGER NOT NULL, ${dates}`,
  note_images: `${identity}, original_name TEXT NOT NULL, mime_type TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, data_base64 TEXT NOT NULL, byte_size INTEGER NOT NULL, created_at TEXT NOT NULL`,
  sessions:
    'id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), user_agent TEXT, ip TEXT, expires_at TEXT NOT NULL, last_used_at TEXT NOT NULL, created_at TEXT NOT NULL',
} as const
export type Root = {
  level: 'years' | 'semesters' | 'subjects' | 'chapters'
  id: string
}
export type Table = keyof typeof TABLES
export type Row = Record<
  string,
  string | number | null | Record<string, unknown>
>
export interface Snapshot {
  version: 4
  review_model: typeof REVIEW_MODEL
  exported_at: string
  tables: Record<Table, Row[]>
}
export const columns = (table: Table) =>
  TABLES[table].split(', ').map((c) => c.split(' ')[0]!)
export const MAX_DATA_BYTES = 128 * 1024 * 1024

/** Une seule transaction : toutes les tables représentent le même instant. */
export async function readSnapshot(
  userId: string,
  db: Pick<Pool, 'connect'> = pool,
  roots?: Root[],
): Promise<Snapshot> {
  const client = await db.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await client.query("SET LOCAL statement_timeout = '15000ms'")
    const tables = {} as Snapshot['tables']
    let bytes = 0,
      count = 0
    for (const table of Object.keys(TABLES) as Table[]) {
      if (
        roots &&
        ![
          'users',
          'years',
          'semesters',
          'subjects',
          'chapters',
          'whiteboards',
          'note_images',
        ].includes(table)
      ) {
        tables[table] = []
        continue
      }
      const args: unknown[] = [userId]
      let filter = ''
      if (roots && table === 'chapters') {
        args.push(
          ...(['chapters', 'subjects', 'semesters', 'years'] as const).map(
            (level) => roots.filter((r) => r.level === level).map((r) => r.id),
          ),
        )
        filter = ` AND (id = ANY($2::uuid[]) OR subject_id = ANY($3::uuid[])
          OR subject_id IN (SELECT su.id FROM subjects su JOIN semesters se ON se.id = su.semester_id AND se.user_id = su.user_id
            WHERE su.user_id = $1 AND (se.id = ANY($4::uuid[]) OR se.year_id = ANY($5::uuid[]))))`
      }
      if (roots && table === 'whiteboards') {
        const subjectIds = tables.subjects
          .filter((su) =>
            roots.some((root) => {
              if (root.level === 'subjects') return root.id === su.id
              if (root.level === 'semesters') return root.id === su.semester_id
              if (root.level === 'years')
                return tables.semesters.some(
                  (se) => se.id === su.semester_id && se.year_id === root.id,
                )
              return false
            }),
          )
          .map((su) => su.id)
        args.push(
          tables.chapters.map((c) => c.id),
          subjectIds,
        )
        filter =
          ' AND (chapter_id = ANY($2::uuid[]) OR subject_id = ANY($3::uuid[]))'
      }
      if (roots && table === 'note_images') {
        args.push([
          ...new Set(
            tables.chapters.flatMap((c) => imageIds(String(c.content_md))),
          ),
        ])
        filter = ' AND id = ANY($2::uuid[])'
      }
      const order =
        table === 'evaluation_chapters' ? 'evaluation_id, chapter_id' : 'id'
      const { rows } = await client.query(
        `SELECT ${columns(table).join(', ')} FROM ${table} WHERE ${table === 'users' ? 'id' : 'user_id'} = $1${filter} ORDER BY ${order} LIMIT 50001`,
        args,
      )
      // pg renvoie les timestamptz en Date ; le JSON intermédiaire les normalise en ISO UTC.
      tables[table] = JSON.parse(JSON.stringify(rows)) as Row[]
      count += rows.length
      bytes += Buffer.byteLength(JSON.stringify(rows))
      if (rows.length > 50000 || count > 100000 || bytes > MAX_DATA_BYTES) {
        throw new HttpError(
          413,
          "Export trop volumineux (100 000 lignes / 128 Mio). Exportez des sélections plus petites ou contactez l'administrateur.",
        )
      }
    }
    if (!tables.users.length) throw new HttpError(404, 'Compte introuvable')
    await client.query('COMMIT')
    return {
      version: 4,
      review_model: REVIEW_MODEL,
      exported_at: new Date().toISOString(),
      tables,
    }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/** Uniquement les images possédées incluses dans l'instantané. Jamais d'accès réseau. */
export function imageBuffers(snapshot: Snapshot): Map<string, Buffer> {
  return new Map(
    snapshot.tables.note_images.map((image) => [
      `/api/note-images/${image.id}`,
      Buffer.from(String(image.data_base64), 'base64'),
    ]),
  )
}
