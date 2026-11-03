import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { unzipSync, strFromU8 } from 'fflate'
import initSqlJs from 'sql.js'
import { pool } from '../db/pool.js'
import * as snapshotService from '../services/export/data.js'
import { readSnapshot } from '../services/export/data.js'
import {
  archive,
  selectedChapters,
  sqlite,
} from '../services/export/archive.js'
import { markdown, pdf } from '../services/export/documents.js'
import { app, expectStatus, newUser, type TestUser } from './helpers.js'

let A: TestUser, B: TestUser
let year: string,
  semester: string,
  subject: string,
  first: string,
  second: string,
  empty: string,
  foreign: string
const post = async (u: TestUser, path: string, body: object) =>
  expectStatus(await u.agent.post(`/api/${path}`).send(body), 201).body
    .id as string
const binary = (
  response: any,
  callback: (error: Error | null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = []
  response.on('data', (c: Buffer) => chunks.push(c))
  response.on('end', () => callback(null, Buffer.concat(chunks)))
  response.on('error', (err: Error) => callback(err, Buffer.alloc(0)))
}
beforeAll(async () => {
  A = await newUser('export-A')
  B = await newUser('export-B')
  year = await post(A, 'years', { label: 'Année / été' })
  empty = await post(A, 'years', { label: 'Année vide' })
  semester = await post(A, 'semesters', { year_id: year, label: 'S1' })
  subject = await post(A, 'subjects', {
    semester_id: semester,
    name: 'Neurosciences',
  })
  first = await post(A, 'chapters', {
    subject_id: subject,
    title: '../../Été : cerveau',
    content_md:
      '## Mémoire\n\nContenu privé A : œ, α, →\n\n- synapse\n\n```ts\nconst x = 2;\n```\n\n| Test | Note |\n|---|---|\n| A | 15 |',
  })
  second = await post(A, 'chapters', {
    subject_id: subject,
    title: '../../Été : cerveau',
    content_md: 'Deuxième',
  })
  const by = await post(B, 'years', { label: 'SECRET-B' })
  const bs = await post(B, 'semesters', { year_id: by, label: 'SECRET-B' })
  const bsu = await post(B, 'subjects', { semester_id: bs, name: 'SECRET-B' })
  foreign = await post(B, 'chapters', {
    subject_id: bsu,
    title: 'SECRET-B',
    content_md: 'SECRET-B',
  })
  await post(A, 'evaluations', {
    subject_id: subject,
    title: 'Partiel',
    date: '2026-12-01',
    grade: 15.5,
    coefficient: 2,
    chapter_ids: [first, second],
  })
  const source = randomUUID()
  await pool.query(
    "INSERT INTO calendar_sources(id,user_id,name,url) VALUES ($1,$2,'Agenda','https://example.org/private.ics')",
    [source, A.id],
  )
  await pool.query(
    "INSERT INTO calendar_events(user_id,title,starts_at,ends_at,subject_id,source_id) VALUES ($1,'Cours','2026-12-01T09:00:00Z','2026-12-01T10:00:00Z',$2,$3)",
    [A.id, subject, source],
  )
})
afterAll(async () => {
  await pool.end()
})

describe('export de documents', () => {
  it('préserve le Markdown et ne répète pas le H1', () => {
    expect(markdown({ title: 'Été', content_md: '# Été\r\n\r\nCorps' })).toBe(
      '# Été\n\nCorps\n',
    )
  })
  it('produit un vrai PDF, paginé pour les longs contenus', async () => {
    const result = await pdf({
      title: 'Été, œ, α',
      content_md: '# Cours\n\n' + 'La mémoire et les neurones.\n\n'.repeat(150),
    })
    expect(result.subarray(0, 5).toString()).toBe('%PDF-')
    expect(
      result.toString('latin1').match(/\/Type \/Page\b/g)!.length,
    ).toBeGreaterThan(1)
  })
  it('refuse les chapitres PDF trop volumineux', async () => {
    await expect(
      pdf({ title: 'Gros', content_md: 'x'.repeat(1024 * 1024 + 1) }),
    ).rejects.toMatchObject({ status: 413 })
  })
  it('télécharge le PDF authentifié avec en-têtes privés', async () => {
    const res = expectStatus(
      await A.agent
        .get(`/api/exports/chapters/${first}/pdf`)
        .buffer(true)
        .parse(binary),
      200,
    )
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename=".*\.pdf"/,
    )
  })
})

describe('sélections et isolation', () => {
  it("refuse les exports anonymes, d'un autre compte et les identifiants absents", async () => {
    expectStatus(
      await request(app).get(`/api/exports/chapters/${first}/pdf`),
      401,
    )
    expectStatus(
      await request(app)
        .post('/api/exports')
        .send({ kind: 'complete', format: 'db' }),
      401,
    )
    for (const chapter of [foreign, randomUUID()])
      expectStatus(
        await A.agent.get(`/api/exports/chapters/${chapter}/pdf`),
        404,
      )
    expectStatus(
      await A.agent.post('/api/exports').send({
        kind: 'selection',
        formats: ['md'],
        roots: [{ level: 'chapters', id: foreign }],
      }),
      404,
    )
  })
  it('valide le format, les UUID et les sélections vides', async () => {
    expectStatus(
      await A.agent
        .post('/api/exports')
        .send({ kind: 'selection', formats: ['exe'], roots: [] }),
      400,
    )
    expectStatus(await A.agent.get('/api/exports/chapters/invalide/pdf'), 400)
    expectStatus(
      await A.agent
        .post('/api/exports')
        .send({ kind: 'complete', format: 'sql', user_id: B.id }),
      400,
    )
  })
  it('chaque niveau sélectionne les descendants et déduplique les chevauchements', async () => {
    const data = await readSnapshot(A.id)
    for (const root of [
      { level: 'years', id: year },
      { level: 'semesters', id: semester },
      { level: 'subjects', id: subject },
    ] as const) {
      expect(
        selectedChapters(data, [root, { level: 'chapters', id: first }])
          .map((c) => c.row.id)
          .sort(),
      ).toEqual([first, second].sort())
    }
    expect(
      selectedChapters(data, [{ level: 'chapters', id: first }]),
    ).toHaveLength(1)
  })
  it('ZIP MD+PDF : fichiers distincts, chemins sûrs, aucun autre compte', async () => {
    const res = expectStatus(
      await A.agent
        .post('/api/exports')
        .send({
          kind: 'selection',
          formats: ['md', 'pdf'],
          roots: [
            { level: 'years', id: year },
            { level: 'chapters', id: first },
          ],
        })
        .buffer(true)
        .parse(binary),
      200,
    )
    const files = unzipSync(res.body)
    const names = Object.keys(files)
    expect(names.filter((n) => n.endsWith('.md'))).toHaveLength(2)
    expect(names.filter((n) => n.endsWith('.pdf'))).toHaveLength(2)
    expect(
      names.some(
        (n) => n.includes('..') || n.startsWith('/') || n.includes('\\'),
      ),
    ).toBe(false)
    expect(
      Object.entries(files)
        .filter(([n]) => n.endsWith('.md'))
        .map(([, v]) => strFromU8(v))
        .join('\n'),
    ).not.toContain('SECRET-B')
    expect(files['data.json']).toBeUndefined()
  })
  it('une année vide produit une archive valide avec manifeste', async () => {
    const res = expectStatus(
      await A.agent
        .post('/api/exports')
        .send({
          kind: 'selection',
          formats: ['md'],
          roots: [{ level: 'years', id: empty }],
        })
        .buffer(true)
        .parse(binary),
      200,
    )
    expect(
      JSON.parse(strFromU8(unzipSync(res.body)['manifest.json']!)).chapters,
    ).toEqual([])
  })
  it("le chargement d'une sélection ignore les contenus non sélectionnés", async () => {
    const data = await readSnapshot(A.id, undefined, [
      { level: 'chapters', id: first },
    ])
    expect(data.tables.chapters.map((c) => c.id)).toEqual([first])
    expect(data.tables.evaluations).toEqual([])
  })
  it('limite les exports concurrents et libère le verrou après terminaison', async () => {
    const snapshot = await readSnapshot(A.id)
    let unblock!: () => void, started!: () => void
    const gate = new Promise<void>((resolve) => {
      unblock = resolve
    })
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    const spy = vi
      .spyOn(snapshotService, 'readSnapshot')
      .mockImplementationOnce(async () => {
        started()
        await gate
        return snapshot
      })
    const pending = A.agent
      .get(`/api/exports/chapters/${first}/md`)
      .then((r) => r)
    try {
      await ready
      expectStatus(await A.agent.get(`/api/exports/chapters/${first}/md`), 429)
    } finally {
      unblock()
      spy.mockRestore()
    }
    expectStatus(await pending, 200)
    expectStatus(await A.agent.get(`/api/exports/chapters/${first}/md`), 200)
  })
  it("la limite PDF rejette sans tronquer l'export", async () => {
    const data = await readSnapshot(A.id)
    data.tables.chapters = Array.from({ length: 201 }, () => ({
      ...data.tables.chapters[0]!,
      id: randomUUID(),
    }))
    await expect(archive(data, ['pdf'])).rejects.toMatchObject({ status: 413 })
  })
})

describe('portabilité complète', () => {
  it('le ZIP complet comprend MD, PDF, profil et données relationnelles sans secrets', async () => {
    const res = expectStatus(
      await A.agent
        .post('/api/exports')
        .send({ kind: 'complete', format: 'zip' })
        .buffer(true)
        .parse(binary),
      200,
    )
    const files = unzipSync(res.body)
    const text = strFromU8(files['data.json']!)
    const data = JSON.parse(text)
    expect(data.tables.users[0].email).toBe(A.email.toLowerCase())
    expect(data.tables.evaluations[0].grade).toBe(15.5)
    expect(data.tables.evaluation_chapters).toHaveLength(2)
    expect(data.tables.calendar_events).toHaveLength(1)
    expect(data.tables.calendar_sources).toHaveLength(1)
    expect(data.tables.sessions.length).toBeGreaterThan(0)
    expect(text).not.toMatch(/password_hash|token_hash|SECRET-B/)
    expect(Object.keys(files).filter((n) => n.endsWith('.pdf'))).toHaveLength(2)
  })
  it('le .db HTTP est SQLite, relisible, avec intégrité et relations intactes', async () => {
    const res = expectStatus(
      await A.agent
        .post('/api/exports')
        .send({ kind: 'complete', format: 'db' })
        .buffer(true)
        .parse(binary),
      200,
    )
    expect((res.body as Buffer).subarray(0, 16).toString()).toBe(
      'SQLite format 3\0',
    )
    const SQL = await initSqlJs()
    const db = new SQL.Database(res.body)
    try {
      expect(db.exec('PRAGMA integrity_check')[0]!.values).toEqual([['ok']])
      expect(db.exec('PRAGMA foreign_key_check')).toEqual([])
      expect(
        db.exec('SELECT count(*) FROM evaluation_chapters')[0]!.values,
      ).toEqual([[2]])
      expect(db.exec('SELECT grade FROM evaluations')[0]!.values).toEqual([
        [15.5],
      ])
      expect(
        db.exec(
          "SELECT content_md FROM chapters WHERE id = '" + first + "'",
        )[0]!.values[0]![0],
      ).toContain('œ, α, →')
      expect(db.exec('SELECT count(*) FROM users')[0]!.values).toEqual([[1]])
      expect(
        db.exec('PRAGMA table_info(users)')[0]!.values.flat(),
      ).not.toContain('password_hash')
      expect(
        db.exec('PRAGMA table_info(sessions)')[0]!.values.flat(),
      ).not.toContain('token_hash')
    } finally {
      db.close()
    }
  })
  it('un compte vide reste exportable en ZIP et DB', async () => {
    const emptyUser = await newUser('export-empty')
    const data = await readSnapshot(emptyUser.id)
    expect(
      Object.keys(
        unzipSync(await archive(data, ['md', 'pdf'], undefined, true)),
      ),
    ).toContain('data.json')
    expect((await sqlite(data)).subarray(0, 6).toString()).toBe('SQLite')
  })
})
