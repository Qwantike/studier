import { randomUUID } from 'node:crypto'
import request from 'supertest'
import initSqlJs from 'sql.js'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { pool } from '../db/pool.js'
import { env } from '../config.js'
import { HttpError } from '../errors.js'
import { generateQuiz } from '../services/quizProvider.js'
import { readSnapshot } from '../services/export/data.js'
import { sqlite } from '../services/export/archive.js'
import { app, newUser, expectStatus, type TestUser } from './helpers.js'
vi.mock('../services/quizProvider.js', async (original) => ({
  ...(await original<object>()),
  generateQuiz: vi.fn(),
}))
const quizData = () => ({
  questions: Array.from({ length: 5 }, (_, i) => ({
    prompt: `Question ${i + 1}`,
    options: ['A', 'B', 'C', 'D'],
    correct_index: i % 4,
    explanation: `Explication ${i + 1}`,
  })),
})
let A: TestUser, B: TestUser, chapter: string, subject: string
const post = async (u: TestUser, path: string, body: object) =>
  expectStatus(await u.agent.post('/api/' + path).send(body), 201).body
    .id as string
const body = (id = randomUUID()) => ({
  id,
  difficulty: 'medium',
  example: 'Un exemple de style',
  consent: true,
})
const create = (u = A, id = chapter, payload: object = body()) =>
  u.agent.post(`/api/chapters/${id}/quizzes`).send(payload)
const detail = async (id: string, u = A) =>
  expectStatus(await u.agent.get('/api/quizzes/' + id), 200).body
beforeAll(async () => {
  env.OPENAI_API_KEY = 'unit-test-key-never-live'
  env.QUIZ_DAILY_LIMIT = 5
  env.QUIZ_PER_MINUTE = 10
  A = await newUser('quizzes-A')
  B = await newUser('quizzes-B')
  const year = await post(A, 'years', { label: '2026' }),
    sem = await post(A, 'semesters', { year_id: year, label: 'S1' })
  subject = await post(A, 'subjects', { semester_id: sem, name: 'Algèbre' })
  chapter = await post(A, 'chapters', {
    subject_id: subject,
    title: 'Matrices',
    content_md:
      'Le produit matriciel est associatif mais généralement non commutatif. Une matrice identité conserve les vecteurs. '.repeat(
        3,
      ),
  })
})
beforeEach(async () => {
  vi.mocked(generateQuiz).mockReset().mockResolvedValue(quizData())
  env.OPENAI_API_KEY = 'unit-test-key-never-live'
  env.QUIZ_DAILY_LIMIT = 5
  env.QUIZ_PER_MINUTE = 10
  await pool.query(
    'DELETE FROM quiz_generation_requests WHERE user_id=ANY($1::uuid[])',
    [[A.id, B.id]],
  )
})
afterAll(async () => {
  await pool.end()
})
it('exige une session, l’appartenance du chapitre, un accord explicite et des champs valides', async () => {
  expectStatus(await request(app).get('/api/quizzes/config'), 401)
  expectStatus(
    await request(app).post(`/api/chapters/${chapter}/quizzes`).send(body()),
    401,
  )
  expectStatus(await create(B), 404)
  for (const invalid of [
    { ...body(), consent: false },
    { ...body(), difficulty: 'impossible' },
    { ...body(), user_id: B.id },
    { ...body(), example: 'x'.repeat(2001) },
    { ...body(), consent: undefined },
  ])
    expectStatus(await create(A, chapter, invalid), 400)
  expect(generateQuiz).not.toHaveBeenCalled()
})
it('ne consomme rien sans configuration ou avec un chapitre vide/trop long', async () => {
  env.OPENAI_API_KEY = ''
  expectStatus(await create(), 503)
  env.OPENAI_API_KEY = 'unit-test-key-never-live'
  for (const [text, status] of [
    ['vide', 400],
    ['x'.repeat(20001), 413],
  ] as const) {
    const id = await post(A, 'chapters', {
      subject_id: subject,
      title: 'Limites',
      content_md: text,
    })
    expectStatus(await create(A, id), status)
  }
  expect(
    (
      await pool.query(
        'SELECT id FROM quiz_generation_requests WHERE user_id=$1',
        [A.id],
      )
    ).rows,
  ).toEqual([])
  expect(generateQuiz).not.toHaveBeenCalled()
})
it('génère une seule fois, conserve la difficulté et masque le corrigé avant soumission', async () => {
  const input = body(),
    created = expectStatus(await create(A, chapter, input), 201).body
  expect(created).toMatchObject({
    id: input.id,
    chapter_id: chapter,
    difficulty: 'medium',
    status: 'ready',
    attempts: [],
  })
  expect(created.questions).toHaveLength(5)
  expect(JSON.stringify(created)).not.toContain('correct_index')
  expect(JSON.stringify(created)).not.toContain('Explication')
  expect(JSON.stringify(created)).not.toContain(env.OPENAI_API_KEY)
  expectStatus(await create(A, chapter, input), 200)
  expectStatus(await create(A, chapter, { ...input, difficulty: 'hard' }), 409)
  expect(generateQuiz).toHaveBeenCalledTimes(1)
  expect(generateQuiz).toHaveBeenCalledWith(
    expect.stringContaining('produit matriciel'),
    'medium',
    'Un exemple de style',
  )
  expectStatus(await B.agent.get('/api/quizzes/' + input.id), 404)
  expectStatus(await B.agent.get(`/api/chapters/${chapter}/quizzes`), 404)
  expectStatus(await create(B, chapter, input), 404)
})
it('calcule le score côté serveur, conserve les tentatives et rejoue sans double écriture', async () => {
  const id = body().id
  expectStatus(await create(A, chapter, body(id)), 201)
  const quiz = await detail(id),
    attemptId = randomUUID()
  const answers = Object.fromEntries(
    quiz.questions.map((q: { id: string }, i: number) => [
      q.id,
      i === 0 ? 1 : i % 4,
    ]),
  )
  const submit = (u = A, payload: object = { id: attemptId, answers }) =>
    u.agent.post(`/api/quizzes/${id}/attempts`).send(payload)
  const result = expectStatus(await submit(), 201).body
  expect(result).toMatchObject({ id: attemptId, score: 4, total: 5 })
  expect(result.questions[0]).toMatchObject({
    selected_index: 1,
    correct_index: 0,
    explanation: 'Explication 1',
  })
  expectStatus(await submit(), 200)
  expectStatus(
    await submit(A, {
      id: attemptId,
      answers: { ...answers, [quiz.questions[0].id]: 0 },
    }),
    409,
  )
  expectStatus(await submit(A, { id: randomUUID(), answers, score: 5 }), 400)
  expectStatus(
    await submit(A, { id: randomUUID(), answers: { [randomUUID()]: 0 } }),
    400,
  )
  expectStatus(await submit(B), 404)
  expectStatus(await B.agent.get('/api/quiz-attempts/' + attemptId), 404)
  expectStatus(await A.agent.get('/api/quiz-attempts/' + attemptId), 200)
  expect((await detail(id)).attempts).toHaveLength(1)
  expect(generateQuiz).toHaveBeenCalledTimes(1)
})
it('applique les quotas durables sans permettre de les contourner en supprimant un chapitre', async () => {
  env.QUIZ_DAILY_LIMIT = 1
  const other = await post(A, 'chapters', {
    subject_id: subject,
    title: 'Suppression',
    content_md: 'contenu de cours suffisamment long. '.repeat(10),
  })
  expectStatus(await create(A, other), 201)
  expectStatus(await A.agent.delete('/api/chapters/' + other), 204)
  expectStatus(await create(), 429)
  const config = expectStatus(
    await A.agent.get('/api/quizzes/config'),
    200,
  ).body
  expect(config).toMatchObject({ remaining_today: 0, daily_limit: 1 })
  expect(generateQuiz).toHaveBeenCalledTimes(1)
})
it('limite le débit par compte et compte aussi les appels échoués sans retry', async () => {
  env.QUIZ_PER_MINUTE = 1
  vi.mocked(generateQuiz).mockRejectedValue(
    new HttpError(502, 'Sortie invalide'),
  )
  const input = body()
  expectStatus(await create(A, chapter, input), 502)
  expectStatus(await create(A, chapter, input), 200)
  expect((await detail(input.id)).status).toBe('failed')
  expectStatus(await create(), 429)
  expect(generateQuiz).toHaveBeenCalledTimes(1)
})
it('réserve une seule génération par compte avant de contacter le fournisseur', async () => {
  // Simulation d’un autre processus déjà en cours, sans dépendre du multiplexage PGlite.
  await pool.query(
    'INSERT INTO quiz_generation_requests(id,user_id) VALUES($1,$2)',
    [randomUUID(), A.id],
  )
  expectStatus(await create(), 409)
  expect(generateQuiz).not.toHaveBeenCalled()
})
it('signale les demandes expirées et refuse les tentatives sur un QCM non prêt', async () => {
  const input = body()
  expectStatus(await create(A, chapter, input), 201)
  await pool.query(
    "UPDATE quiz_generation_requests SET status='generating',created_at=now()-interval '3 minutes' WHERE id=$1",
    [input.id],
  )
  expect((await detail(input.id)).status).toBe('failed')
  expectStatus(
    await A.agent
      .post(`/api/quizzes/${input.id}/attempts`)
      .send({ id: randomUUID(), answers: {} }),
    409,
  )
})
it('exporte QCM, corrigés, tentatives et consommation en JSON et SQLite sans fuite entre comptes', async () => {
  const id = body().id
  expectStatus(await create(A, chapter, body(id)), 201)
  const quiz = await detail(id)
  expectStatus(
    await A.agent.post(`/api/quizzes/${id}/attempts`).send({
      id: randomUUID(),
      answers: Object.fromEntries(
        quiz.questions.map((q: { id: string }) => [q.id, 0]),
      ),
    }),
    201,
  )
  const data = await readSnapshot(A.id)
  expect(data.version).toBe(6)
  expect(data.tables.questions).toHaveLength(5)
  expect(data.tables.attempts).toHaveLength(1)
  expect((await readSnapshot(B.id)).tables.quizzes).toEqual([])
  const SQL = await initSqlJs(),
    db = new SQL.Database(await sqlite(data))
  try {
    expect(db.exec('PRAGMA user_version')[0]!.values).toEqual([[6]])
    expect(db.exec('SELECT count(*) FROM questions')[0]!.values).toEqual([[5]])
    expect(db.exec('SELECT count(*) FROM attempts')[0]!.values).toEqual([[1]])
    expect(db.exec('PRAGMA foreign_key_check')).toEqual([])
  } finally {
    db.close()
  }
})
it('impose les clés étrangères entre comptes et supprime QCM/tentatives avec le chapitre', async () => {
  const other = await post(A, 'chapters', {
    subject_id: subject,
    title: 'Intégrité',
    content_md:
      'Cours pour tester les suppressions et clés étrangères. '.repeat(10),
  })
  const id = body().id
  expectStatus(await create(A, other, body(id)), 201)
  const full = await detail(id)
  expectStatus(
    await A.agent.post(`/api/quizzes/${id}/attempts`).send({
      id: randomUUID(),
      answers: Object.fromEntries(
        full.questions.map((q: { id: string }) => [q.id, 0]),
      ),
    }),
    201,
  )
  await pool.query('DELETE FROM questions WHERE quiz_id=$1 AND position=0', [
    id,
  ])
  await expect(
    pool.query(
      'INSERT INTO questions(user_id,quiz_id,position,prompt,options,correct_index,explanation) VALUES($1,$2,0,\'X\',\'["A","B","C","D"]\',0,\'X\')',
      [B.id, id],
    ),
  ).rejects.toMatchObject({ code: '23503' })
  expectStatus(await A.agent.delete('/api/chapters/' + other), 204)
  expectStatus(await A.agent.get('/api/quizzes/' + id), 404)
  expect(
    (await pool.query('SELECT id FROM attempts WHERE quiz_id=$1', [id])).rows,
  ).toEqual([])
  expect(
    (await pool.query('SELECT id FROM questions WHERE quiz_id=$1', [id])).rows,
  ).toEqual([])
  expect(
    (
      await pool.query('SELECT id FROM quiz_generation_requests WHERE id=$1', [
        id,
      ])
    ).rows,
  ).toHaveLength(1)
})
