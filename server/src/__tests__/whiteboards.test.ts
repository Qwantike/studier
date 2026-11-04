import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import initSqlJs from 'sql.js'
import { unzipSync, strFromU8 } from 'fflate'
import { pool } from '../db/pool.js'
import { emptyScene } from '../services/whiteboards.js'
import { readSnapshot } from '../services/export/data.js'
import { archive, sqlite } from '../services/export/archive.js'
import { app, expectStatus, newUser, type TestUser } from './helpers.js'

let A: TestUser, B: TestUser
let subject: string, chapter: string, board: string, foreign: string
const post = async (u: TestUser, path: string, body: object) =>
  expectStatus(await u.agent.post(`/api/${path}`).send(body), 201).body
async function parent(u: TestUser) {
  const year = await post(u, 'years', { label: 'Année' })
  const sem = await post(u, 'semesters', { year_id: year.id, label: 'S1' })
  return (await post(u, 'subjects', { semester_id: sem.id, name: 'Matière' }))
    .id as string
}
beforeAll(async () => {
  A = await newUser('boards-a')
  B = await newUser('boards-b')
  subject = await parent(A)
  chapter = (
    await post(A, 'chapters', { subject_id: subject, title: 'Chapitre' })
  ).id
  const sb = await parent(B)
  foreign = (
    await post(B, 'whiteboards', { subject_id: sb, title: 'SECRET-B' })
  ).id
  board = (
    await post(A, 'whiteboards', { chapter_id: chapter, title: 'Mon tableau' })
  ).id
})
afterAll(async () => {
  await pool.end()
})

describe('tableaux privés', () => {
  it('exige une session et protège les mutations contre une origine étrangère', async () => {
    expectStatus(await request(app).get('/api/whiteboards'), 401)
    expectStatus(
      await A.agent
        .post('/api/whiteboards')
        .set('Origin', 'https://evil.invalid')
        .send({ subject_id: subject, title: 'X' }),
      403,
    )
  })
  it('liste uniquement les métadonnées de son compte et filtre le parent', async () => {
    const rows = expectStatus(
      await A.agent.get(`/api/whiteboards?chapter_id=${chapter}`),
      200,
    ).body
    expect(rows.map((r: { id: string }) => r.id)).toContain(board)
    expect(rows[0].scene).toBeUndefined()
    expect(JSON.stringify(rows)).not.toContain('SECRET-B')
    expect(
      expectStatus(
        await A.agent.get(`/api/whiteboards?subject_id=${subject}`),
        200,
      ).body,
    ).toEqual([])
  })
  it('refuse lecture, écriture et suppression sur un autre compte', async () => {
    for (const id of [foreign, randomUUID()]) {
      expectStatus(await A.agent.get(`/api/whiteboards/${id}`), 404)
      expectStatus(
        await A.agent
          .patch(`/api/whiteboards/${id}`)
          .send({ title: 'Vol', revision: 1 }),
        404,
      )
      expectStatus(
        await A.agent.delete(`/api/whiteboards/${id}?revision=1`),
        404,
      )
    }
  })
  it('exige un parent unique et refuse un parent étranger', async () => {
    expectStatus(
      await A.agent.post('/api/whiteboards').send({ title: 'Sans parent' }),
      400,
    )
    expectStatus(
      await A.agent
        .post('/api/whiteboards')
        .send({ title: 'Deux', subject_id: subject, chapter_id: chapter }),
      400,
    )
    expectStatus(
      await B.agent
        .post('/api/whiteboards')
        .send({ title: 'Vol', subject_id: subject }),
      404,
    )
  })
  it('la clé composite en base interdit les liens inter-comptes', async () => {
    await expect(
      pool.query(
        'INSERT INTO whiteboards(user_id,chapter_id,title,scene) VALUES ($1,$2,$3,$4)',
        [B.id, chapter, 'Vol SQL', JSON.stringify(emptyScene())],
      ),
    ).rejects.toMatchObject({ code: '23503' })
  })
  it('enregistre le JSON et incrémente la révision sans écrasement concurrent', async () => {
    const scene = {
      ...emptyScene(),
      elements: [
        { id: 'a', type: 'rectangle', x: 2, y: 3, width: 100, height: 80 },
      ],
    }
    const result = expectStatus(
      await A.agent
        .patch(`/api/whiteboards/${board}`)
        .send({ scene, revision: 1 }),
      200,
    ).body
    expect(result.revision).toBe(2)
    expectStatus(
      await A.agent
        .patch(`/api/whiteboards/${board}`)
        .send({ title: 'Ancienne version', revision: 1 }),
      409,
    )
    const saved = expectStatus(
      await A.agent.get(`/api/whiteboards/${board}`),
      200,
    ).body
    expect(saved.scene.elements).toEqual(scene.elements)
  })
  it('deux écritures avec la même révision ne peuvent pas réussir ensemble', async () => {
    const revision = expectStatus(
      await A.agent.get(`/api/whiteboards/${board}`),
      200,
    ).body.revision
    const results = await Promise.all(
      ['Un', 'Deux'].map((title) =>
        A.agent.patch(`/api/whiteboards/${board}`).send({ title, revision }),
      ),
    )
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
  })
  it('ne permet pas de déplacer un tableau par PATCH ni de changer user_id', async () => {
    expectStatus(
      await A.agent
        .patch(`/api/whiteboards/${board}`)
        .send({ revision: 3, subject_id: subject }),
      400,
    )
    expectStatus(
      await A.agent
        .patch(`/api/whiteboards/${board}`)
        .send({ revision: 3, user_id: B.id }),
      400,
    )
  })
  it('rejette les scènes invalides, images SVG et intégrations web', async () => {
    for (const scene of [
      { ...emptyScene(), version: 1 },
      {
        ...emptyScene(),
        elements: [
          { id: 'a', type: 'iframe', x: 0, y: 0, width: 10, height: 10 },
        ],
      },
      {
        ...emptyScene(),
        elements: [
          {
            id: 'a',
            type: 'image',
            fileId: 'absent',
            x: 0,
            y: 0,
            width: 10,
            height: 10,
          },
        ],
      },
      {
        ...emptyScene(),
        elements: [
          {
            id: 'a',
            type: 'text',
            link: 'javascript:alert(1)',
            x: 0,
            y: 0,
            width: 10,
            height: 10,
          },
        ],
      },
      {
        ...emptyScene(),
        files: {
          img: {
            id: 'img',
            mimeType: 'image/svg+xml',
            dataURL: 'data:image/svg+xml;base64,PHN2Zz4=',
            created: 1,
          },
        },
      },
    ])
      expectStatus(
        await A.agent
          .post('/api/whiteboards')
          .send({ title: 'Invalide', subject_id: subject, scene }),
        400,
      )
  })
  it('conserve les images raster incorporées', async () => {
    const file = {
      id: 'image1',
      mimeType: 'image/png',
      dataURL: 'data:image/png;base64,iVBORw0KGgo=',
      created: 1,
    }
    const scene = {
      ...emptyScene(),
      files: { image1: file },
      elements: [
        {
          id: 'img',
          type: 'image',
          fileId: 'image1',
          x: 0,
          y: 0,
          width: 10,
          height: 10,
        },
      ],
    }
    const result = await post(A, 'whiteboards', {
      title: 'Image',
      subject_id: subject,
      scene,
    })
    expect(
      expectStatus(await A.agent.get(`/api/whiteboards/${result.id}`), 200).body
        .scene.files.image1,
    ).toEqual(file)
  })
  it('la suppression du parent supprime la scène', async () => {
    const c = await post(A, 'chapters', {
      title: 'Temporaire',
      subject_id: subject,
    })
    const b = await post(A, 'whiteboards', {
      title: 'Temporaire',
      chapter_id: c.id,
    })
    expectStatus(await A.agent.delete(`/api/chapters/${c.id}`), 204)
    expectStatus(await A.agent.get(`/api/whiteboards/${b.id}`), 404)
  })
  it('refuse la suppression avec une révision obsolète et libère le stockage après suppression', async () => {
    const b = await post(A, 'whiteboards', {
      title: 'À effacer',
      subject_id: subject,
    })
    expectStatus(
      await A.agent.delete(`/api/whiteboards/${b.id}?revision=999`),
      409,
    )
    const before = expectStatus(
      await A.agent.get('/api/whiteboards/usage'),
      200,
    ).body
    expectStatus(
      await A.agent.delete(`/api/whiteboards/${b.id}?revision=1`),
      204,
    )
    const after = expectStatus(
      await A.agent.get('/api/whiteboards/usage'),
      200,
    ).body
    expect(after.bytes).toBeLessThan(before.bytes)
    expect(after.count).toBe(before.count - 1)
  })
})

describe('quotas appliqués en base', () => {
  it('refuse une scène de plus de 2 Mio via API et SQL', async () => {
    const scene = { ...emptyScene(), junk: 'x'.repeat(2097153) }
    expectStatus(
      await A.agent
        .post('/api/whiteboards')
        .send({ title: 'Gros', subject_id: subject, scene }),
      413,
    )
    await expect(
      pool.query(
        'INSERT INTO whiteboards(user_id,subject_id,title,scene) VALUES ($1,$2,$3,$4)',
        [A.id, subject, 'Gros SQL', JSON.stringify(scene)],
      ),
    ).rejects.toMatchObject({
      code: 'P0001',
      message: 'whiteboard_scene_limit',
    })
  })
  it('refuse la 201e scène, même vide', async () => {
    const user = await newUser('count-quota'),
      sub = await parent(user)
    await pool.query(
      "INSERT INTO whiteboards(user_id,subject_id,title,scene) SELECT $1,$2,'Scène ' || n,$3::jsonb FROM generate_series(1,200) AS n",
      [user.id, sub, JSON.stringify(emptyScene())],
    )
    expectStatus(
      await user.agent
        .post('/api/whiteboards')
        .send({ title: '201', subject_id: sub }),
      413,
    )
  })
  it('refuse un dépassement des 20 Mio du compte puis autorise après suppression', async () => {
    const user = await newUser('bytes-quota'),
      sub = await parent(user)
    const scene = { ...emptyScene(), padding: 'x'.repeat(1950000) }
    const insert = () =>
      pool.query(
        'INSERT INTO whiteboards(user_id,subject_id,title,scene) VALUES ($1,$2,$3,$4::jsonb)',
        [user.id, sub, 'Quota', JSON.stringify(scene)],
      )
    for (let i = 0; i < 10; i++) await insert()
    await expect(insert()).rejects.toMatchObject({
      code: 'P0001',
      message: 'whiteboard_account_limit',
    })
    await pool.query(
      'DELETE FROM whiteboards WHERE id = (SELECT id FROM whiteboards WHERE user_id=$1 LIMIT 1)',
      [user.id],
    )
    await insert()
  }, 30000)
})

describe('exports des tableaux', () => {
  it('inclut les scènes complètes dans JSON, ZIP et SQLite sans fuite', async () => {
    const data = await readSnapshot(A.id)
    expect(data.version).toBe(3)
    expect(data.tables.whiteboards.some((b) => b.id === board)).toBe(true)
    expect(JSON.stringify(data.tables.whiteboards)).not.toContain('SECRET-B')
    const zip = unzipSync(await archive(data, ['md'], undefined, true))
    expect(
      JSON.parse(strFromU8(zip[`tableaux/${board}.excalidraw`]!)).type,
    ).toBe('excalidraw')
    const SQL = await initSqlJs(),
      db = new SQL.Database(await sqlite(data))
    try {
      expect(db.exec('PRAGMA foreign_key_check')).toEqual([])
      const rows = db.exec(
        "SELECT scene FROM whiteboards WHERE id='" + board + "'",
      )[0]!
      expect(JSON.parse(String(rows.values[0]![0])).elements[0].type).toBe(
        'rectangle',
      )
      expect(db.exec('PRAGMA user_version')[0]!.values).toEqual([[3]])
    } finally {
      db.close()
    }
  })
  it('une sélection de chapitre exclut les tableaux de matière, une matière les inclut', async () => {
    const c = await readSnapshot(A.id, undefined, [
      { level: 'chapters', id: chapter },
    ])
    expect(c.tables.whiteboards.map((b) => b.id)).toEqual([board])
    const s = await readSnapshot(A.id, undefined, [
      { level: 'subjects', id: subject },
    ])
    expect(s.tables.whiteboards.length).toBeGreaterThan(
      c.tables.whiteboards.length,
    )
  })
})
