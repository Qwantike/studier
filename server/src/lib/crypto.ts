import crypto from 'node:crypto'
import { env } from '../config.js'

const ALGO = 'aes-256-gcm'
// On force le cast en string au cas où le typage de config.ts ne remonte pas parfaitement
const KEY = Buffer.from(env.ENCRYPTION_KEY as string, 'hex')

export function encrypt(text: string): string {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv(ALGO, KEY, iv)

    // Travailler avec des Buffer évite les erreurs de surcharge TypeScript
    const encryptedBuffer = Buffer.concat([
        cipher.update(Buffer.from(text, 'utf8')),
        cipher.final()
    ])

    const authTag = cipher.getAuthTag()

    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encryptedBuffer.toString('base64')}`
}

export function decrypt(encrypted: string): string {
    const parts = encrypted.split(':')
    if (parts.length !== 3) throw new Error('Format chiffré invalide')

    // Le "!" indique à TypeScript que nous sommes sûrs que la valeur existe (grâce au test de length juste au-dessus)
    const iv = Buffer.from(parts[0]!, 'base64')
    const authTag = Buffer.from(parts[1]!, 'base64')
    const encText = Buffer.from(parts[2]!, 'base64')

    const decipher = crypto.createDecipheriv(ALGO, KEY, iv)
    decipher.setAuthTag(authTag)

    const decryptedBuffer = Buffer.concat([
        decipher.update(encText),
        decipher.final()
    ])

    return decryptedBuffer.toString('utf8')
}