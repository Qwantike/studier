import { posix } from 'node:path'
import { parsePlot, plotSvg } from '../../../../shared/functionPlot.js'
import { marked, type Token } from 'marked'
import { zipSync, strToU8 } from 'fflate'
import initSqlJs from 'sql.js'
import { createRequire } from 'node:module'
import { HttpError } from '../../errors.js'
import {
  TABLES,
  imageBuffers,
  columns,
  type Snapshot,
  type Table,
  type Row,
  type Root,
} from './data.js'
import { markdown, pdf, slug } from './documents.js'

export type { Root } from './data.js'
export type Format = 'md' | 'pdf'
const require = createRequire(import.meta.url)
let sql: ReturnType<typeof initSqlJs> | undefined
const loadSql = () =>
  (sql ??= initSqlJs({
    locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm'),
  }))
const id = (row: Row) => String(row.id)
const ordered = (rows: Row[]) =>
  [...rows].sort(
    (a, b) =>
      Number(a.position) - Number(b.position) ||
      String(a.created_at).localeCompare(String(b.created_at)) ||
      id(a).localeCompare(id(b)),
  )
// UUID complet : collisions impossibles même si les titres sont identiques ou dangereux.
const segment = (row: Row) =>
  `${slug(String(row.label ?? row.name ?? row.title)).slice(0, 14)}--${BigInt(
    `0x${id(row).replace(/-/g, '')}`,
  )
    .toString(32)
    .padStart(26, '0')}`

export function selectedChapters(
  snapshot: Snapshot,
  roots?: Root[],
): { row: Row; path: string }[] {
  const t = snapshot.tables
  if (roots)
    for (const root of roots) {
      if (!t[root.level].some((r) => r.id === root.id))
        throw new HttpError(404, 'Sélection introuvable')
    }
  const selected = new Set(roots?.map((r) => `${r.level}:${r.id}`))
  const has = (level: Root['level'], row: Row) =>
    selected.has(`${level}:${id(row)}`)
  const result: { row: Row; path: string }[] = []
  for (const y of ordered(t.years))
    for (const s of ordered(t.semesters.filter((r) => r.year_id === y.id)))
      for (const subject of ordered(
        t.subjects.filter((r) => r.semester_id === s.id),
      ))
        for (const chapter of ordered(
          t.chapters.filter((r) => r.subject_id === subject.id),
        )) {
          if (
            !roots ||
            has('years', y) ||
            has('semesters', s) ||
            has('subjects', subject) ||
            has('chapters', chapter)
          ) {
            result.push({
              row: chapter,
              path: [y, s, subject, chapter].map(segment).join('/'),
            })
          }
        }
  return result
}

export async function sqlite(snapshot: Snapshot): Promise<Buffer> {
  const SQL = await loadSql()
  const db = new SQL.Database()
  try {
    db.run('PRAGMA foreign_keys=ON; PRAGMA user_version=6; BEGIN;')
    db.run(
      'CREATE TABLE export_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    )
    db.run('INSERT INTO export_metadata VALUES (?, ?), (?, ?)', [
      'version',
      String(snapshot.version),
      'exported_at',
      snapshot.exported_at,
    ])
    db.run('INSERT INTO export_metadata VALUES (?, ?)', [
      'review_model',
      JSON.stringify(snapshot.review_model),
    ])
    for (const table of Object.keys(TABLES) as Table[]) {
      db.run(
        `CREATE TABLE ${table} (${TABLES[table]}${table === 'evaluation_chapters' ? ', PRIMARY KEY (evaluation_id, chapter_id)' : ''})`,
      )
      const keys = columns(table)
      const statement = db.prepare(
        `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
      )
      try {
        for (const row of snapshot.tables[table])
          statement.run(
            keys.map((k) =>
              typeof row[k] === 'boolean'
                ? Number(row[k])
                : typeof row[k] === 'object' && row[k] !== null
                  ? JSON.stringify(row[k])
                  : ((row[k] as string | number | null) ?? null),
            ),
          )
      } finally {
        statement.free()
      }
    }
    if (db.exec('PRAGMA foreign_key_check').length)
      throw new Error("Relations incohérentes dans l'export")
    db.run('COMMIT')
    return Buffer.from(db.export())
  } finally {
    db.close()
  }
}

export async function archive(
  snapshot: Snapshot,
  formats: Format[],
  roots?: Root[],
  complete = false,
): Promise<Buffer> {
  const chapters = selectedChapters(snapshot, roots)
  if (formats.includes('pdf') && chapters.length > 200)
    throw new HttpError(
      413,
      "Maximum 200 chapitres par export PDF. Réduisez la sélection ou utilisez l'export .db.",
    )
  const files: Record<string, Uint8Array> = Object.create(null)
  let size = 0
  const add = (path: string, value: Uint8Array) => {
    size += value.byteLength
    if (size > 256 * 1024 * 1024)
      throw new HttpError(
        413,
        "Archive trop volumineuse (256 Mio avant compression). Réduisez la sélection ou utilisez l'export .db.",
      )
    files[path] = value
  }
  const images = imageBuffers(snapshot)
  const imagePaths = new Map(
    snapshot.tables.note_images.map((image) => [
      `/api/note-images/${image.id}`,
      `images/${image.id}.${image.mime_type === 'image/jpeg' ? 'jpg' : 'png'}`,
    ]),
  )
  for (const [url, buffer] of images) add(imagePaths.get(url)!, buffer)
  const plots: { chapter_id: string; path: string }[] = []
  for (const { row, path } of chapters) {
    const chapter = {
      title: String(row.title),
      content_md: String(row.content_md),
    }
    if (formats.includes('md')) {
      let md = markdown(chapter)
      for (const [url, imagePath] of imagePaths)
        md = md.replaceAll(
          url,
          posix.relative(posix.dirname(`cours/${path}.md`), imagePath),
        )
      // Le MD conserve la source éditable ; les SVG voisins restent lisibles sans extension Markdown.
      let index = 0
      marked.walkTokens(marked.lexer(chapter.content_md), (token: Token) => {
        if (
          token.type !== 'code' ||
          token.lang?.trim().toLowerCase() !== 'plot'
        )
          return
        try {
          const svg = plotSvg(parsePlot(token.text)),
            plotPath = `graphiques/${row.id}-${++index}.svg`
          add(plotPath, strToU8(svg))
          plots.push({ chapter_id: String(row.id), path: plotPath })
          md += `\n![Courbe de fonctions ${index}](${posix.relative(posix.dirname(`cours/${path}.md`), plotPath)})\n`
        } catch (error) {
          if (error instanceof HttpError)
            throw error /* source invalide conservée */
        }
      })
      add(`cours/${path}.md`, strToU8(md))
    }
    if (formats.includes('pdf'))
      add(`cours/${path}.pdf`, await pdf(chapter, images))
  }
  for (const board of snapshot.tables.whiteboards) {
    add(
      `tableaux/${board.id}.excalidraw`,
      strToU8(JSON.stringify(board.scene, null, 2)),
    )
  }
  add(
    'manifest.json',
    strToU8(
      JSON.stringify(
        {
          version: 6,
          exported_at: snapshot.exported_at,
          complete,
          formats,
          roots:
            roots?.map((root) => ({
              ...root,
              label:
                snapshot.tables[root.level].find((r) => r.id === root.id)
                  ?.label ??
                snapshot.tables[root.level].find((r) => r.id === root.id)
                  ?.name ??
                snapshot.tables[root.level].find((r) => r.id === root.id)
                  ?.title,
            })) ?? null,
          chapters: chapters.map(({ row, path }) => ({
            id: row.id,
            path,
            title: row.title,
          })),
          whiteboards: snapshot.tables.whiteboards.map((b) => ({
            id: b.id,
            title: b.title,
            subject_id: b.subject_id,
            chapter_id: b.chapter_id,
            path: `tableaux/${b.id}.excalidraw`,
          })),
          images: snapshot.tables.note_images.map((image) => ({
            id: image.id,
            path: imagePaths.get(`/api/note-images/${image.id}`),
            mime_type: image.mime_type,
          })),
          plots,
          omitted: ['password_hash', 'token_hash'],
        },
        null,
        2,
      ),
    ),
  )
  if (complete) add('data.json', strToU8(JSON.stringify(snapshot, null, 2)))
  add(
    'LIRE-MOI.txt',
    strToU8(
      "Export Studier v6\nLes fichiers de cours sont classés par année/semestre/matière.\nLes identifiants dans les noms évitent les collisions. Une sélection vide reste décrite dans le manifeste.\nL'export complet contient data.json : profil, cours, historique des révisions et paramètres du modèle estimatif, activités et préférences de parcours, QCM et corrigés, tentatives et registre des générations, tableaux blancs, évaluations, liens, événements, abonnements et métadonnées des sessions. Les scènes sont aussi dans tableaux/*.excalidraw. Les images sont dans images/, avec liens relatifs dans le Markdown. Les blocs plot conservent leur source et ont un aperçu SVG dans graphiques/. Les blocs Mermaid restent en source dans le MD et le PDF textuel.\nMots de passe et jetons de session exclus. Les URL des calendriers peuvent être privées : protégez cette archive.\nPDF : rendu textuel, titres, listes, code et tables en blocs. Couleurs de la palette et surlignage rendus ; autre HTML et formules LaTeX restent en texte source ; images importées incorporées, courbes plot tracées. Aucune image distante téléchargée.\nLa base .db proposée séparément est un instantané SQLite portable, pas un dump PostgreSQL ni une restauration automatique.\n",
    ),
  )
  return Buffer.from(zipSync(files, { level: 6 }))
}
