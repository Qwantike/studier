import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import initSqlJs from 'sql.js'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { pool } from '../db/pool.js'
import { readSnapshot } from '../services/export/data.js'
import { sqlite } from '../services/export/archive.js'
import { app, newUser, expectStatus, type TestUser } from './helpers.js'
let A: TestUser, B: TestUser, chapter: string, subject: string
const get = async (u = A, tz = 'UTC') =>
  expectStatus(
    await u.agent.get(`/api/study?timezone=${encodeURIComponent(tz)}`),
    200,
  ).body
const prefs = async (body: object, u = A) =>
  expectStatus(await u.agent.patch('/api/study/preferences').send(body), 200)
    .body
beforeAll(async () => {
  A = await newUser('study-A')
  B = await newUser('study-B')
  const post = async (path: string, body: object) =>
    expectStatus(await A.agent.post('/api/' + path).send(body), 201).body
      .id as string
  const year = await post('years', { label: '2026' })
  const sem = await post('semesters', { year_id: year, label: 'S1' })
  subject = await post('subjects', { semester_id: sem, name: 'Maths' })
  chapter = await post('chapters', { subject_id: subject, title: 'Matrices' })
})
afterAll(async () => {
  await pool.end()
})
it('rattrape les anciennes révisions et journalise uniquement les transactions validées', async () => {
  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    await db.query(`DROP TRIGGER trg_study_review ON reviews;
      DROP TABLE study_activity; DROP TABLE study_preferences;
      DROP FUNCTION log_study_review();
      ALTER TABLE reviews DROP CONSTRAINT reviews_id_user_unique`)
    const id = randomUUID()
    await db.query(
      "INSERT INTO reviews(id,user_id,chapter_id,reviewed_at,rating,stability_days,ordinal) VALUES($1,$2,$3,'2026-01-01T23:30:00Z','again',1,1)",
      [id, A.id, chapter],
    )
    await db.query(
      await readFile(
        new URL('../migrations/009_study_activity.sql', import.meta.url),
        'utf8',
      ),
    )
    const rows = await db.query(
      'SELECT id,occurred_at FROM study_activity WHERE user_id=$1',
      [A.id],
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0].id).toBe(id)
    expect(new Date(rows.rows[0].occurred_at).toISOString()).toBe(
      '2026-01-01T23:30:00.000Z',
    )
    await db.query('SAVEPOINT before_review')
    await db.query(
      "INSERT INTO reviews(id,user_id,chapter_id,rating,stability_days,ordinal) VALUES($1,$2,$3,'good',5,2)",
      [randomUUID(), A.id, chapter],
    )
    expect(
      (await db.query('SELECT id FROM study_activity WHERE user_id=$1', [A.id]))
        .rows,
    ).toHaveLength(2)
    await db.query('ROLLBACK TO SAVEPOINT before_review')
    expect(
      (await db.query('SELECT id FROM study_activity WHERE user_id=$1', [A.id]))
        .rows,
    ).toHaveLength(1)
  } finally {
    await db.query('ROLLBACK')
    db.release()
  }
})
it('masque les statistiques par défaut et conserve les préférences sur le compte', async () => {
  expect(await get()).toEqual({
    preferences: { enabled: false, weekly_days: 3 },
  })
  await prefs({ enabled: true, weekly_days: 4 })
  expect((await get()).preferences).toEqual({ enabled: true, weekly_days: 4 })
  expect((await get()).subjects[0]).toMatchObject({
    total: 1,
    revised: 0,
    reviewed: 0,
  })
  expect((await get()).total_reviews).toBe(0)
  await prefs({ enabled: false })
  expect(await get()).toEqual({
    preferences: { enabled: false, weekly_days: 4 },
  })
  expect(await get(B)).toEqual({
    preferences: { enabled: false, weekly_days: 3 },
  })
})
it('journalise les rappels atomiquement, même masqués, sans compter les éditions ni les rejeux', async () => {
  expectStatus(
    await A.agent.patch(`/api/chapters/${chapter}`).send({ status: 'revised' }),
    200,
  )
  expect(
    (await pool.query('SELECT id FROM study_activity WHERE user_id=$1', [A.id]))
      .rows,
  ).toHaveLength(0)
  const id = randomUUID()
  const post = () =>
    A.agent
      .post(`/api/chapters/${chapter}/reviews`)
      .send({ id, rating: 'again' })
  expectStatus(await post(), 201)
  expectStatus(await post(), 200)
  await prefs({ enabled: true })
  const state = await get()
  expect(state.total_reviews).toBe(1)
  expect(state.weekly_days).toBe(1)
  expect(state.current_streak).toBe(1)
  expect(state.badges[0].earned).toBe(true)
  expect(state.recent[0]).toMatchObject({
    id,
    chapter_id: chapter,
    title: 'Matrices',
    subject_name: 'Maths',
  })
  expect(state.subjects[0]).toMatchObject({ total: 1, revised: 1, reviewed: 1 })
})
it('refuse les données arbitraires et protège les routes entre comptes', async () => {
  expectStatus(await request(app).get('/api/study'), 401)
  expectStatus(
    await request(app).patch('/api/study/preferences').send({ enabled: true }),
    401,
  )
  for (const body of [
    { weekly_days: 0 },
    { weekly_days: 8 },
    { weekly_days: 1.5 },
    { enabled: 'true' },
    { user_id: B.id },
    {},
    { weekly_days: null },
  ]) {
    expectStatus(await A.agent.patch('/api/study/preferences').send(body), 400)
  }
  expectStatus(await A.agent.get('/api/study?timezone=bad/zone'), 400)
  expectStatus(await A.agent.get('/api/study?user_id=' + B.id), 400)
  expectStatus(
    await B.agent
      .post(`/api/chapters/${chapter}/reviews`)
      .send({ id: randomUUID(), rating: 'good' }),
    404,
  )
  await prefs({ enabled: true }, B)
  expect((await get(B)).recent).toEqual([])
  expect((await get(B)).subjects).toEqual([])
  expect((await get(B)).total_reviews).toBe(0)
})
it('exporte les événements et préférences en JSON et SQLite sans fuite', async () => {
  const data = await readSnapshot(A.id)
  expect(data.version).toBe(5)
  expect(data.tables.study_activity).toHaveLength(1)
  expect(data.tables.study_preferences[0]).toMatchObject({
    user_id: A.id,
    enabled: true,
    weekly_days: 4,
  })
  expect((await readSnapshot(B.id)).tables.study_activity).toEqual([])
  const SQL = await initSqlJs()
  const db = new SQL.Database(await sqlite(data))
  try {
    expect(
      db.exec('SELECT enabled,weekly_days FROM study_preferences')[0]!.values,
    ).toEqual([[1, 4]])
    expect(db.exec('SELECT count(*) FROM study_activity')[0]!.values).toEqual([
      [1],
    ])
    expect(db.exec('PRAGMA foreign_key_check')).toEqual([])
    expect(
      db.exec("SELECT value FROM export_metadata WHERE key='version'")[0]!
        .values,
    ).toEqual([['5']])
  } finally {
    db.close()
  }
})
it('regroupe les événements selon le fuseau demandé, pas celui du serveur', async () => {
  const id = expectStatus(
    await A.agent
      .post('/api/chapters')
      .send({ subject_id: subject, title: 'Dates locales' }),
    201,
  ).body.id as string
  try {
    await pool.query(
      "INSERT INTO reviews(id,user_id,chapter_id,reviewed_at,rating,stability_days,ordinal) VALUES($1,$2,$3,'2020-01-05T23:30:00Z','good',5,1),($4,$2,$3,'2020-01-06T00:30:00Z','good',5,2)",
      [randomUUID(), A.id, id, randomUUID()],
    )
    expect((await get(A, 'UTC')).best_streak).toBe(2)
    expect((await get(A, 'Europe/Paris')).best_streak).toBe(1)
  } finally {
    expectStatus(await A.agent.delete('/api/chapters/' + id), 204)
  }
})
it('nettoie les événements lors de la suppression du chapitre', async () => {
  expectStatus(await A.agent.delete(`/api/chapters/${chapter}`), 204)
  expect((await get()).total_reviews).toBe(0)
  expect((await get()).subjects[0]).toMatchObject({
    id: subject,
    total: 0,
    reviewed: 0,
    revised: 0,
  })
})
