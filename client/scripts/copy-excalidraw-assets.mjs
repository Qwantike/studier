import { cp, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const entry = fileURLToPath(import.meta.resolve('@excalidraw/excalidraw'))
const target = fileURLToPath(
  new URL('../public/excalidraw/fonts', import.meta.url),
)
await mkdir(target, { recursive: true })
await cp(resolve(dirname(entry), 'fonts'), target, { recursive: true })
