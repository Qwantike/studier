import { z } from 'zod'
import { HttpError } from '../errors.js'

export const SCENE_LIMIT = 2 * 1024 * 1024
export const ACCOUNT_LIMIT = 20 * 1024 * 1024
export const BOARD_LIMIT = 200
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/)
const coordinate = z.number().finite().min(-1_000_000).max(1_000_000)
const safeLink = z
  .string()
  .max(4000)
  .refine((s) => /^(https?:\/\/|mailto:|#)/i.test(s), 'Lien non autorisé')
const element = z
  .object({
    id: identifier,
    type: z.enum([
      'rectangle',
      'diamond',
      'ellipse',
      'line',
      'arrow',
      'freedraw',
      'text',
      'image',
      'frame',
    ]),
    x: coordinate,
    y: coordinate,
    width: z.number().finite().min(0).max(100000),
    height: z.number().finite().min(0).max(100000),
    angle: z.number().finite().optional(),
    isDeleted: z.boolean().optional(),
    fileId: identifier.nullable().optional(),
    link: safeLink.nullable().optional(),
    text: z.string().max(100000).optional(),
    points: z
      .array(z.tuple([coordinate, coordinate]))
      .max(10000)
      .optional(),
  })
  .passthrough()
const file = z
  .object({
    id: identifier,
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
    dataURL: z
      .string()
      .max(SCENE_LIMIT)
      .regex(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]*={0,2}$/),
    created: z.number().finite().nonnegative(),
    lastRetrieved: z.number().finite().nonnegative().optional(),
  })
  .refine(
    (f) => f.dataURL.startsWith(`data:${f.mimeType};base64,`),
    'Type image incohérent',
  )
export const sceneSchema = z
  .object({
    type: z.literal('excalidraw'),
    version: z.literal(2),
    source: z.string().max(200).default('studier'),
    elements: z.array(element).max(5000),
    appState: z
      .object({
        viewBackgroundColor: z.string().max(50).optional(),
        scrollX: coordinate.optional(),
        scrollY: coordinate.optional(),
        zoom: z
          .object({ value: z.number().finite().min(0.1).max(30) })
          .optional(),
        gridSize: z.number().finite().min(0).max(1000).nullable().optional(),
      })
      .default({}),
    files: z.record(identifier, file).default({}),
  })
  .superRefine((scene, ctx) => {
    const ids = new Set<string>()
    for (const el of scene.elements) {
      if (ids.has(el.id))
        ctx.addIssue({
          code: 'custom',
          message: 'Identifiant de forme dupliqué',
        })
      ids.add(el.id)
      if (
        el.type === 'image' &&
        !el.isDeleted &&
        (!el.fileId || !Object.hasOwn(scene.files, el.fileId))
      )
        ctx.addIssue({ code: 'custom', message: 'Image incorporée manquante' })
    }
    for (const [key, f] of Object.entries(scene.files)) {
      if (key !== f.id)
        ctx.addIssue({
          code: 'custom',
          message: 'Identifiant image incohérent',
        })
    }
  })
export const emptyScene = () => ({
  type: 'excalidraw' as const,
  version: 2 as const,
  source: 'studier',
  elements: [],
  appState: {},
  files: {},
})
export function parseScene(value: unknown) {
  if (Buffer.byteLength(JSON.stringify(value) ?? '') > SCENE_LIMIT)
    throw new HttpError(
      413,
      'Scène trop volumineuse : maximum 2 Mio, images comprises.',
    )
  return sceneSchema.parse(value)
}
export function translateBoardError(error: unknown): never {
  const { code, message } = error as { code?: string; message?: string }
  const messages: Record<string, string> = {
    whiteboard_scene_limit:
      'Scène trop volumineuse : maximum 2 Mio, images comprises.',
    whiteboard_account_limit:
      'Quota de tableaux atteint : maximum 20 Mio par compte. Supprimez des tableaux ou des images.',
    whiteboard_count_limit: 'Maximum 200 tableaux par compte.',
  }
  if (code === 'P0001' && message && messages[message])
    throw new HttpError(413, messages[message])
  if (code === '23503') throw new HttpError(404, 'Parent introuvable')
  throw error
}
