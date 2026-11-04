import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import sharp from 'sharp'
import { unzipSync, strFromU8 } from 'fflate'
import initSqlJs from 'sql.js'
import { pool } from '../db/pool.js'
import { normalizeImage, IMAGE_LIMIT } from '../services/noteImages.js'
import { readSnapshot } from '../services/export/data.js'
import { archive, sqlite } from '../services/export/archive.js'
import { app, newUser, expectStatus, type TestUser } from './helpers.js'
let A: TestUser,
  B: TestUser,
  chapter: string,
  image: { id: string; url: string },
  png: Buffer
const post = async (u: TestUser, path: string, body: object) =>
  expectStatus(await u.agent.post('/api/' + path).send(body), 201).body
    .id as string
beforeAll(async () => {
  A = await newUser('images-A')
  B = await newUser('images-B')
  const year = await post(A, 'years', { label: 'A' }),
    sem = await post(A, 'semesters', { year_id: year, label: 'S1' }),
    subject = await post(A, 'subjects', { semester_id: sem, name: 'Analyse' })
  chapter = await post(A, 'chapters', { subject_id: subject, title: 'Courbes' })
  png = await sharp({
    create: { width: 100, height: 60, channels: 4, background: '#2563eb' },
  })
    .png()
    .toBuffer()
})
afterAll(async () => {
  await pool.end()
})
const upload = (u: TestUser, data = png, id = chapter) =>
  u.agent
    .post(`/api/chapters/${id}/images`)
    .attach('image', data, { filename: 'courbe.png', contentType: 'image/png' })
describe('images privées', () => {
  it('importe et sert une vraie image avec métadonnées et cache privé', async () => {
    const res = expectStatus(await upload(A), 201)
    image = res.body
    expect(res.body).toMatchObject({
      mime_type: 'image/png',
      width: 100,
      height: 60,
    })
    expect(res.body.byte_size).toBeGreaterThan(0)
    const file = expectStatus(await A.agent.get(image.url), 200)
    expect(file.headers['content-type']).toContain('image/png')
    expect(file.headers['cache-control']).toBe('private, no-store')
    expect((await sharp(file.body).metadata()).width).toBe(100)
  })
  it('isole les téléchargements, listes, suppressions et imports par compte', async () => {
    expectStatus(await request(app).get(image.url), 401)
    expectStatus(await B.agent.get(image.url), 404)
    expectStatus(await B.agent.delete(image.url), 404)
    expectStatus(await upload(B), 404)
    expect(
      expectStatus(await B.agent.get('/api/note-images'), 200).body,
    ).toEqual([])
    expect(
      expectStatus(await A.agent.get('/api/note-images/usage'), 200).body,
    ).toMatchObject({ count: 1, account_limit: 52428800 })
  })
  it('refuse les fichiers déguisés, SVG et imports au-delà de 4 Mio', async () => {
    expectStatus(await upload(A, Buffer.from('pas une image')), 400)
    expectStatus(
      await upload(A, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
      400,
    )
    expectStatus(await upload(A, Buffer.alloc(IMAGE_LIMIT + 1)), 413)
    expectStatus(await A.agent.post(`/api/chapters/${chapter}/images`), 400)
  })
  it('redimensionne les grandes images et normalise WebP en PNG', async () => {
    const input = await sharp({
      create: { width: 3000, height: 20, channels: 3, background: 'red' },
    })
      .webp()
      .toBuffer()
    const result = await normalizeImage(input)
    expect(result.width).toBe(2560)
    expect(result.mime_type).toBe('image/png')
    await expect(
      normalizeImage(
        await sharp({
          create: { width: 5000, height: 5000, channels: 3, background: 'red' },
        })
          .png()
          .toBuffer(),
      ),
    ).rejects.toMatchObject({ status: 400 })
  })
  it('empêche de supprimer un fichier encore référencé', async () => {
    expectStatus(
      await A.agent.patch(`/api/chapters/${chapter}`).send({
        content_md: `![Courbe](${image.url})\n\n\`\`\`plot\nsin(x)\nx^2 / 4\nx: -5, 5\ny: -2, 7\n\`\`\``,
      }),
      200,
    )
    expectStatus(await A.agent.delete(image.url), 409)
  })
  it('exporte les fichiers et courbes en ZIP portable et incorpore les images dans le PDF', async () => {
    const unused = expectStatus(await upload(A), 201).body as { id: string }
    expect((await readSnapshot(A.id)).tables.note_images).toHaveLength(2)
    const snapshot = await readSnapshot(A.id, undefined, [
      { level: 'chapters', id: chapter },
    ])
    expect(snapshot.tables.note_images).toHaveLength(1)
    expectStatus(await A.agent.delete(`/api/note-images/${unused.id}`), 204)
    const files = unzipSync(
      await archive(
        snapshot,
        ['md', 'pdf'],
        [{ level: 'chapters', id: chapter }],
      ),
    )
    const mdPath = Object.keys(files).find((p) => p.endsWith('.md'))!
    const md = strFromU8(files[mdPath]!)
    expect(md).toContain(`../../../../images/${image.id}.png`)
    expect(md).toContain('```plot')
    expect(md).toContain('../../../../graphiques/')
    expect(Object.keys(files).filter((p) => p.endsWith('.svg'))).toHaveLength(1)
    expect(files[`images/${image.id}.png`]).toBeDefined()
    const pdf = Buffer.from(
      files[Object.keys(files).find((p) => p.endsWith('.pdf'))!]!,
    ).toString('latin1')
    expect(pdf).toContain('/Subtype /Image')
    expect(pdf.startsWith('%PDF-')).toBe(true)
    const foreign = await readSnapshot(B.id)
    expect(foreign.tables.note_images).toEqual([])
  })
  it('conserve le binaire dans le .db et le JSON complet', async () => {
    const snapshot = await readSnapshot(A.id)
    const SQL = await initSqlJs(),
      db = new SQL.Database(await sqlite(snapshot))
    try {
      expect(db.exec('PRAGMA user_version')[0]!.values).toEqual([[3]])
      const rows = db.exec('SELECT data_base64,byte_size FROM note_images')[0]!
        .values
      expect(Buffer.from(String(rows[0]![0]), 'base64').length).toBe(
        rows[0]![1],
      )
      expect(db.exec('PRAGMA foreign_key_check')).toEqual([])
    } finally {
      db.close()
    }
    const files = unzipSync(await archive(snapshot, ['md'], undefined, true))
    expect(
      JSON.parse(strFromU8(files['data.json']!)).tables.note_images[0].id,
    ).toBe(image.id)
  })
  it('supprime les fichiers inutilisés puis libère le quota', async () => {
    expectStatus(
      await A.agent.patch(`/api/chapters/${chapter}`).send({ content_md: '' }),
      200,
    )
    expectStatus(await A.agent.delete(image.url), 204)
    expectStatus(await A.agent.get(image.url), 404)
    expect(
      expectStatus(await A.agent.get('/api/note-images/usage'), 200).body.count,
    ).toBe(0)
  })
  it('applique les plafonds par fichier et par compte dans la base', async () => {
    const insert = (base64: string) =>
      pool.query(
        "INSERT INTO note_images(user_id,original_name,mime_type,width,height,data_base64) VALUES($1,'quota','image/png',1,1,$2)",
        [B.id, base64],
      )
    await expect(
      insert(Buffer.alloc(IMAGE_LIMIT + 1).toString('base64')),
    ).rejects.toMatchObject({ code: 'P0001', message: 'note_image_size_limit' })
    const chunk = Buffer.alloc(IMAGE_LIMIT).toString('base64')
    for (let i = 0; i < 12; i++) await insert(chunk)
    await expect(insert(chunk)).rejects.toMatchObject({
      code: 'P0001',
      message: 'note_image_account_limit',
    })
    await pool.query('DELETE FROM note_images WHERE user_id=$1', [B.id])
    await pool.query(
      "INSERT INTO note_images(user_id,original_name,mime_type,width,height,data_base64) SELECT $1,'quota','image/png',1,1,'AA==' FROM generate_series(1,500)",
      [B.id],
    )
    expectStatus(await upload(B, png, chapter), 404)
    await expect(insert('AA==')).rejects.toMatchObject({
      code: 'P0001',
      message: 'note_image_count_limit',
    })
  })
})
