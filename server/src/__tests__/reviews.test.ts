import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { unzipSync, strFromU8 } from 'fflate'
import initSqlJs from 'sql.js'
import { pool } from '../db/pool.js'
import { readSnapshot } from '../services/export/data.js'
import { archive, sqlite } from '../services/export/archive.js'
import { localDay, shiftDay } from '../../../shared/reviewModel.js'
import { app, newUser, expectStatus, type TestUser } from './helpers.js'
let A: TestUser, B: TestUser, subject: string, foreign: string
const post = async (u: TestUser, path: string, body: object) =>
  expectStatus(await u.agent.post('/api/' + path).send(body), 201).body
    .id as string
const chapter = (status = 'not_started') =>
  post(A, 'chapters', { subject_id: subject, title: 'Révision', status })
const record = (id: string, rating = 'good', reviewId = randomUUID(), u = A) =>
  u.agent.post(`/api/chapters/${id}/reviews`).send({ id: reviewId, rating })
const detail = async (id: string) =>
  expectStatus(
    await A.agent.get(`/api/chapters/${id}/reviews?timezone=UTC`),
    200,
  ).body
beforeAll(async () => {
  A = await newUser('reviews-A')
  B = await newUser('reviews-B')
  const year = await post(A, 'years', { label: '2026' }),
    sem = await post(A, 'semesters', { year_id: year, label: 'S1' })
  subject = await post(A, 'subjects', { semester_id: sem, name: 'Maths' })
  const by = await post(B, 'years', { label: 'SECRET-B' }),
    bs = await post(B, 'semesters', { year_id: by, label: 'S1' }),
    bsub = await post(B, 'subjects', { semester_id: bs, name: 'SECRET-B' })
  foreign = await post(B, 'chapters', { subject_id: bsub, title: 'SECRET-B' })
})
afterAll(async () => {
  await pool.end()
})
describe('suivi et estimation des révisions', () => {
  it('initialise une seule fois le suivi au premier statut appris, sans fausse révision', async () => {
    const id = await chapter()
    expect((await detail(id)).chapter.memory).toMatchObject({
      active: false,
      review_count: 0,
      anchor_at: null,
    })
    expectStatus(
      await A.agent.patch(`/api/chapters/${id}`).send({ status: 'understood' }),
      200,
    )
    const first = await detail(id)
    expect(first.chapter.memory).toMatchObject({
      active: true,
      stability_days: 5,
      review_count: 0,
    })
    expect(first.history).toEqual([])
    expectStatus(
      await A.agent.patch(`/api/chapters/${id}`).send({
        title: 'Titre édité',
        content_md: 'nouvelle note',
        status: 'revised',
      }),
      200,
    )
    const after = await detail(id)
    expect(after.chapter.memory.anchor_at).toBe(first.chapter.memory.anchor_at)
    expect(after.chapter.memory.stability_days).toBe(5)
  })
  it('enregistre une auto-évaluation et actualise le statut, avec rejeu idempotent', async () => {
    const id = await chapter(),
      key = randomUUID()
    const first = expectStatus(await record(id, 'good', key), 201).body
    expect(first.status).toBe('revised')
    expect(first.review).toMatchObject({
      ordinal: 1,
      rating: 'good',
      stability_days: 5,
      model_version: 1,
    })
    expectStatus(await record(id, 'good', key), 200)
    expectStatus(await record(id, 'easy', key), 409)
    const state = await detail(id)
    expect(state.history).toHaveLength(1)
    expect(state.chapter.memory.review_count).toBe(1)
    expect(state.chapter.memory.retention).toBeGreaterThan(0.99)
    expect(state.chapter.memory.due_today).toBe(false)
  })
  it('ne multiplie pas la stabilité lors de rappels immédiats et raccourcit après un échec', async () => {
    const id = await chapter()
    expectStatus(await record(id, 'easy'), 201)
    const second = expectStatus(await record(id, 'good'), 201).body.review
    expect(second.ordinal).toBe(2)
    expect(second.stability_days).toBeLessThan(8.01)
    const failed = expectStatus(await record(id, 'again'), 201).body
    expect(failed.review.stability_days).toBe(1)
    expect(failed.status).toBe('revised')
    const state = await detail(id)
    expect(state.chapter.memory.due_now).toBe(false)
    expect(state.history.map((r: { ordinal: number }) => r.ordinal)).toEqual([
      3, 2, 1,
    ])
  })
  it('sérialise les envois simultanés et les numéros d’historique', async () => {
    const id = await chapter(),
      key = randomUUID()
    const same = await Promise.all([
      record(id, 'good', key),
      record(id, 'good', key),
    ])
    expect(same.map((r) => r.status).sort()).toEqual([200, 201])
    const next = await Promise.all([record(id, 'hard'), record(id, 'easy')])
    expect(next.map((r) => r.body.review.ordinal).sort()).toEqual([2, 3])
    expect((await detail(id)).chapter.memory.review_count).toBe(3)
  })
  it('ne fait pas confiance au user_id, aux dates et aux paramètres envoyés par le client', async () => {
    const id = await chapter()
    for (const body of [
      { id: randomUUID(), rating: 'wrong' },
      { id: randomUUID(), rating: 'good', user_id: B.id },
      { id: randomUUID(), rating: 'good', reviewed_at: '2099-01-01' },
      { id: randomUUID(), rating: 'good', stability_days: 1000 },
      { rating: 'good' },
    ])
      expectStatus(
        await A.agent.post(`/api/chapters/${id}/reviews`).send(body),
        400,
      )
    expectStatus(await A.agent.get('/api/reviews?timezone=invalid/nope'), 400)
    expectStatus(await A.agent.get('/api/reviews?offset=-1'), 400)
  })
  it('isole les listes, historiques, révisions et filtres entre comptes', async () => {
    expectStatus(await request(app).get('/api/reviews'), 401)
    expectStatus(
      await request(app)
        .post(`/api/chapters/${foreign}/reviews`)
        .send({ id: randomUUID(), rating: 'good' }),
      401,
    )
    expectStatus(await A.agent.get(`/api/chapters/${foreign}/reviews`), 404)
    expectStatus(await record(foreign), 404)
    expectStatus(
      await A.agent.get(`/api/chapters/${randomUUID()}/reviews`),
      404,
    )
    const state = expectStatus(
      await A.agent.get('/api/reviews?scope=all'),
      200,
    ).body
    expect(JSON.stringify(state)).not.toContain('SECRET-B')
    expectStatus(
      await A.agent.get(`/api/reviews?subject_id=${randomUUID()}`),
      404,
    )
  })
  it('active le suivi après un échec initial, et le met en pause si le statut devient non commencé', async () => {
    const id = await chapter()
    expect(expectStatus(await record(id, 'again'), 201).body.status).toBe(
      'seen',
    )
    expectStatus(
      await A.agent
        .patch(`/api/chapters/${id}`)
        .send({ status: 'not_started' }),
      200,
    )
    expect((await detail(id)).chapter.memory).toMatchObject({
      active: false,
      due_today: false,
      review_count: 1,
    })
    expectStatus(
      await A.agent.patch(`/api/chapters/${id}`).send({ status: 'seen' }),
      200,
    )
    expect((await detail(id)).chapter.memory.review_count).toBe(1)
  })
  it('calcule les rappels et la pagination dans le fuseau demandé', async () => {
    const id = await chapter('seen')
    await pool.query(
      "UPDATE chapters SET review_started_at=now()-interval '10 days' WHERE id=$1",
      [id],
    )
    const all = expectStatus(
      await A.agent.get(
        '/api/reviews?scope=all&limit=1&timezone=Pacific%2FKiritimati',
      ),
      200,
    ).body
    expect(all.today).toBe(localDay(new Date(), 'Pacific/Kiritimati'))
    expect(all.items).toHaveLength(1)
    expect(all.total).toBeGreaterThan(1)
    const due = expectStatus(
      await A.agent.get('/api/reviews?timezone=UTC'),
      200,
    ).body
    expect(due.items.some((item: { id: string }) => item.id === id)).toBe(true)
    expect((await detail(id)).chapter.memory.retention).toBeLessThan(0.01)
    expect(
      due.items.find((item: { id: string }) => item.id === id).memory.due_now,
    ).toBe(true)
  })
  it('avance le rappel avant l’évaluation puis le retire après une révision du jour', async () => {
    const id = await chapter('revised'),
      date = shiftDay(localDay(new Date(), 'UTC'), 1)
    await pool.query(
      'UPDATE chapters SET initial_stability_days=100 WHERE id=$1',
      [id],
    )
    const evaluation = await post(A, 'evaluations', {
      subject_id: subject,
      title: 'Examen demain',
      date,
      chapter_ids: [id],
    })
    const before = await detail(id)
    expect(before.chapter.memory).toMatchObject({
      exam_advanced: true,
      due_now: true,
      due_today: true,
    })
    const list = expectStatus(
      await A.agent.get(
        `/api/reviews?scope=all&evaluation_id=${evaluation}&timezone=UTC`,
      ),
      200,
    ).body
    expect(list.items.map((row: { id: string }) => row.id)).toEqual([id])
    expectStatus(
      await B.agent.get(`/api/reviews?evaluation_id=${evaluation}`),
      404,
    )
    expectStatus(await record(id, 'good'), 201)
    expect((await detail(id)).chapter.memory).toMatchObject({
      exam_advanced: false,
      due_today: false,
    })
    expectStatus(
      await A.agent
        .patch(`/api/evaluations/${evaluation}`)
        .send({ chapter_ids: [] }),
      200,
    )
    expect((await detail(id)).chapter.evaluation_id).toBeNull()
  })
  it('affiche les 50 dernières révisions, sans perdre le compteur ni l’historique exporté', async () => {
    const id = await chapter('seen')
    await pool.query(
      "INSERT INTO reviews(id,user_id,chapter_id,reviewed_at,rating,stability_days,ordinal) SELECT gen_random_uuid(),$1,$2,now()-(56-g)*interval '1 minute','good',5,g FROM generate_series(1,55) g",
      [A.id, id],
    )
    const state = await detail(id)
    expect(state.chapter.memory.review_count).toBe(55)
    expect(state.history).toHaveLength(50)
    expect(state.history[0].ordinal).toBe(55)
    const snapshot = await readSnapshot(A.id)
    expect(snapshot.version).toBe(6)
    expect(snapshot.review_model.version).toBe(1)
    expect(
      snapshot.tables.reviews.filter((row) => row.chapter_id === id),
    ).toHaveLength(55)
    const zip = unzipSync(await archive(snapshot, ['md'], undefined, true))
    expect(JSON.parse(strFromU8(zip['data.json']!)).tables.reviews.length).toBe(
      snapshot.tables.reviews.length,
    )
    const SQL = await initSqlJs(),
      db = new SQL.Database(await sqlite(snapshot))
    try {
      expect(db.exec('PRAGMA user_version')[0]!.values).toEqual([[6]])
      expect(db.exec('SELECT count(*) FROM reviews')[0]!.values).toEqual([
        [snapshot.tables.reviews.length],
      ])
      expect(db.exec('PRAGMA foreign_key_check')).toEqual([])
      expect(
        JSON.parse(
          String(
            db.exec(
              "SELECT value FROM export_metadata WHERE key='review_model'",
            )[0]!.values[0]![0],
          ),
        ).target,
      ).toBe(0.8)
    } finally {
      db.close()
    }
    expect((await readSnapshot(B.id)).tables.reviews).toEqual([])
  })
  it('ne fabrique pas de rétention pour les anciens chapitres sans date connue', async () => {
    const id = await chapter('understood')
    await pool.query(
      'UPDATE chapters SET review_started_at=NULL,initial_stability_days=NULL WHERE id=$1',
      [id],
    )
    expect((await detail(id)).chapter.memory).toMatchObject({
      active: true,
      anchor_at: null,
      retention: null,
      due_now: true,
    })
    expectStatus(await record(id, 'good'), 201)
    expect((await detail(id)).chapter.memory.retention).toBeGreaterThan(0.99)
  })
  it('impose l’intégrité entre comptes et supprime les révisions avec leur chapitre', async () => {
    const id = await chapter()
    expectStatus(await record(id), 201)
    await expect(
      pool.query(
        "INSERT INTO reviews(id,user_id,chapter_id,rating,stability_days,ordinal) VALUES($1,$2,$3,'good',5,2)",
        [randomUUID(), B.id, id],
      ),
    ).rejects.toMatchObject({ code: '23503' })
    await expect(
      pool.query(
        "INSERT INTO reviews(id,user_id,chapter_id,rating,stability_days,ordinal) VALUES($1,$2,$3,'good',-1,2)",
        [randomUUID(), A.id, id],
      ),
    ).rejects.toMatchObject({ code: '23514' })
    expectStatus(await A.agent.delete(`/api/chapters/${id}`), 204)
    expect(
      (await pool.query('SELECT id FROM reviews WHERE chapter_id=$1', [id]))
        .rows,
    ).toEqual([])
  })
})
