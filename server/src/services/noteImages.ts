import sharp from 'sharp'
import { HttpError } from '../errors.js'
export const IMAGE_LIMIT = 4 * 1024 * 1024,
  IMAGE_ACCOUNT_LIMIT = 50 * 1024 * 1024,
  IMAGE_COUNT_LIMIT = 500
export async function normalizeImage(input: Buffer) {
  if (!input.length || input.length > IMAGE_LIMIT)
    throw new HttpError(413, 'Image trop volumineuse : maximum 4 Mio.')
  try {
    const source = sharp(input, {
      limitInputPixels: 20_000_000,
      failOn: 'warning',
    })
    const metadata = await source.metadata()
    if (!['png', 'jpeg', 'webp', 'gif'].includes(metadata.format ?? ''))
      throw new HttpError(400, 'Choisissez une image PNG, JPEG, WebP ou GIF.')
    const resized = source.rotate().resize({
      width: 2560,
      height: 2560,
      fit: 'inside',
      withoutEnlargement: true,
    })
    const { data, info } = await (
      metadata.format === 'jpeg'
        ? resized.jpeg({ quality: 90 })
        : resized.png({ compressionLevel: 7 })
    ).toBuffer({ resolveWithObject: true })
    if (data.length > IMAGE_LIMIT)
      throw new HttpError(
        413,
        'Image trop volumineuse après traitement : maximum 4 Mio.',
      )
    return {
      data,
      width: info.width,
      height: info.height,
      mime_type: info.format === 'jpeg' ? 'image/jpeg' : 'image/png',
    }
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(
      400,
      'Image invalide, trop grande (20 millions de pixels maximum) ou format non pris en charge.',
    )
  }
}
export const imageIds = (markdown: string): string[] => [
  ...new Set(
    [
      ...markdown.matchAll(
        /\/api\/note-images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![0-9a-z-])/gi,
      ),
    ].map((m) => m[1]!.toLowerCase()),
  ),
]
