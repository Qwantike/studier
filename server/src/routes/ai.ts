import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { pool, withTx } from '../db/pool.js'
import { HttpError } from '../errors.js'
import { uid } from '../middleware/auth.js'
import { encrypt, decrypt } from '../lib/crypto.js'
import { openAiProvider, geminiProvider } from '../services/llm.js'
import { ah, idSchema } from './crud.js'

export const aiRouter = Router()

const keySchema = z.object({
    provider: z.enum(['openai', 'gemini']),
    model: z.string().min(1),
    api_key: z.string().min(10)
})

const generateSchema = z.object({
    chapter_ids: z.array(idSchema).min(1).max(20),
    difficulty: z.enum(['facile', 'moyen', 'difficile']),
    questionCount: z.number().min(1).max(30),
    types: z.array(z.enum(['qcm', 'open'])).min(1)
})

const evalLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10 })

// Paramètres IA
aiRouter.get('/settings', ah(async (req, res) => {
    const { rows } = await pool.query('SELECT provider, model, api_key_suffix FROM ai_settings WHERE user_id = $1', [uid(req)])
    if (!rows[0]) return res.json({ has_key: false })
    res.json({ has_key: true, provider: rows[0].provider, model: rows[0].model, api_key_suffix: rows[0].api_key_suffix })
}))

aiRouter.post('/settings', ah(async (req, res) => {
    const { provider, model, api_key } = keySchema.parse(req.body)
    const suffix = api_key.slice(-4)
    const encrypted = encrypt(api_key)
    await pool.query(`
    INSERT INTO ai_settings (user_id, provider, model, api_key_encrypted, api_key_suffix) 
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id) DO UPDATE SET provider = $2, model = $3, api_key_encrypted = $4, api_key_suffix = $5, updated_at = now()
  `, [uid(req), provider, model, encrypted, suffix])
    res.json({ has_key: true, provider, model, api_key_suffix: suffix })
}))

aiRouter.delete('/settings', ah(async (req, res) => {
    await pool.query('DELETE FROM ai_settings WHERE user_id = $1', [uid(req)])
    res.status(204).end()
}))

// Lancement du job de génération
aiRouter.post('/generate', evalLimiter, ah(async (req, res) => {
    const userId = uid(req)
    const body = generateSchema.parse(req.body)

    const settings = await pool.query('SELECT provider, model, api_key_encrypted FROM ai_settings WHERE user_id = $1', [userId])
    if (!settings.rows[0]) throw new HttpError(400, 'Clé API manquante')

    const apiKey = decrypt(settings.rows[0].api_key_encrypted)

    // Construction sécurisée du cours
    const chapters = await pool.query(
        'SELECT title, content_md FROM chapters WHERE id = ANY($1::uuid[]) AND user_id = $2 ORDER BY position',
        [body.chapter_ids, userId]
    )
    if (chapters.rows.length !== body.chapter_ids.length) throw new HttpError(403, 'Certains chapitres sont inaccessibles')

    const combinedContent = chapters.rows.map(c => `# ${c.title}\n${c.content_md}`).join('\n\n')
    if (combinedContent.length > 50000) throw new HttpError(400, 'Le contenu des chapitres est trop volumineux pour la génération.')

    // Création du job
    const job = await pool.query('INSERT INTO ai_jobs (user_id) VALUES ($1) RETURNING id', [userId])
    const jobId = job.rows[0].id
    const providerName = settings.rows[0].provider
    const modelName = settings.rows[0].model

    // Fire and forget (Pas de await)
    generateAndSave(jobId, userId, providerName, modelName, apiKey, combinedContent, body)
        .catch(e => console.error('Job generation failed:', e))

    res.status(202).json({ job_id: jobId })
}))

// Polling
aiRouter.get('/jobs/:id', ah(async (req, res) => {
    const { rows } = await pool.query('SELECT status, result, error_message FROM ai_jobs WHERE id = $1 AND user_id = $2', [req.params.id, uid(req)])
    if (!rows[0]) throw new HttpError(404, 'Job introuvable')
    res.json(rows[0])
}))

// Récupérer une évaluation IA générée
aiRouter.get('/evaluations/:id', ah(async (req, res) => {
    const { rows } = await pool.query(
        'SELECT id, title, content, created_at FROM ai_evaluations WHERE id = $1 AND user_id = $2',
        [idSchema.parse(req.params.id), uid(req)]
    )
    if (!rows[0]) throw new HttpError(404, 'Évaluation introuvable')
    res.json(rows[0])
}))

async function generateAndSave(jobId: string, userId: string, providerName: string, modelName: string, apiKey: string, text: string, options: any) {
    try {
        const provider = providerName === 'gemini' ? geminiProvider : openAiProvider;
        const result = (await provider.generateEval(apiKey, modelName, text, options)) as { title?: string;[key: string]: any }

        // Sauvegarde en transaction
        await withTx(async (client) => {
            const evalReq = await client.query('INSERT INTO ai_evaluations (user_id, title, content) VALUES ($1, $2, $3) RETURNING id',
                [userId, result.title || 'Évaluation IA', result]
            )
            const newEvalId = evalReq.rows[0].id

            if (options.chapter_ids && options.chapter_ids.length > 0) {
                await client.query(
                    'INSERT INTO ai_evaluation_chapters (ai_evaluation_id, chapter_id, user_id) SELECT $1::uuid, unnest($2::uuid[]), $3::uuid',
                    [newEvalId, options.chapter_ids, userId]
                )
            }

            await client.query("UPDATE ai_jobs SET status = 'done', result = $1 WHERE id = $2", [{ evaluation_id: newEvalId }, jobId])
        })
    } catch (err: any) {
        await pool.query("UPDATE ai_jobs SET status = 'error', error_message = $1 WHERE id = $2", [err.message || 'Erreur LLM', jobId])
    }
}