import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright-core'
import { HttpError } from '../../errors.js'
import { validateMermaid } from '../../../../shared/mermaid.js'
import { type Token } from 'marked'
import { documentMarkdown } from './inlineFormatting.js'

export type GraphicKind = 'inline' | 'display' | 'mermaid'
export interface GraphicSource {
  kind: GraphicKind
  source: string
}
export interface Graphic {
  png: Buffer
  width: number
  height: number
  ascent: number
}

const require = createRequire(import.meta.url)
const origin = 'https://studier-pdf.invalid'
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/katex.min.css">
<style>
  body{margin:0;color:#202635;font-family:Arial,sans-serif}
  #graphic{display:table;padding:2px;white-space:nowrap}
  .katex-display{margin:0}
</style>
<script defer src="/katex.min.js"></script>
<script defer src="/mermaid.min.js"></script>
<script defer src="/purify.min.js"></script>
<script defer src="/renderer.js"></script>
</head><body><div id="graphic"></div></body></html>`

async function loadPage(page: Page) {
  const katex = dirname(require.resolve('katex'))
  const assets = new Map<string, string | URL>([
    ['/katex.min.css', join(katex, 'katex.min.css')],
    ['/katex.min.js', join(katex, 'katex.min.js')],
    [
      '/mermaid.min.js',
      join(dirname(require.resolve('mermaid')), 'mermaid.min.js'),
    ],
    [
      '/purify.min.js',
      join(dirname(require.resolve('dompurify')), 'purify.min.js'),
    ],
    ['/renderer.js', new URL('./pdfGraphics.browser.js', import.meta.url)],
  ])
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (
      url.origin !== origin ||
      url.search ||
      route.request().method() !== 'GET'
    )
      return route.abort()
    if (url.pathname === '/') {
      return route.fulfill({
        contentType: 'text/html; charset=utf-8',
        headers: {
          'Content-Security-Policy':
            "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; base-uri 'none'; form-action 'none'",
        },
        body: html,
      })
    }
    const path =
      assets.get(url.pathname) ??
      (/^\/fonts\/KaTeX_[\w-]+\.woff2$/.test(url.pathname)
        ? join(katex, url.pathname.slice(1))
        : undefined)
    if (!path) return route.abort()
    const contentType = url.pathname.endsWith('.css')
      ? 'text/css'
      : url.pathname.endsWith('.woff2')
        ? 'font/woff2'
        : 'text/javascript'
    return route.fulfill({ contentType, body: await readFile(path) })
  })
  await page.goto(origin, { timeout: 10000 })
  await page.waitForFunction(
    () => 'renderStudierGraphic' in window,
    undefined,
    {
      timeout: 5000,
    },
  )
}

const graphicsKey = ({ kind, source }: GraphicSource) => kind + ':' + source
export function graphicSource(token: Token): GraphicSource | undefined {
  if (token.type === 'inlineMath') return { kind: 'inline', source: token.text }
  if (token.type === 'displayMath')
    return { kind: 'display', source: token.text }
  if (token.type === 'code') {
    switch (token.lang?.trim().toLowerCase()) {
      case 'latex':
      case 'tex':
        return { kind: 'display', source: token.text }
      case 'mermaid':
        return { kind: 'mermaid', source: token.text }
    }
  }
}

function canRender({ kind, source }: GraphicSource): boolean {
  if (!source.trim()) return false
  if (kind !== 'mermaid') return source.length <= 4000
  try {
    validateMermaid(source)
    return true
  } catch {
    return false
  }
}

export class PdfGraphicsRenderer {
  private browser?: Promise<Browser>

  private launch() {
    return (this.browser ??= chromium
      .launch({
        executablePath: process.env.PDF_CHROMIUM_EXECUTABLE || undefined,
        chromiumSandbox: process.env.PDF_CHROMIUM_NO_SANDBOX !== '1',
        timeout: 15000,
      })
      .catch((error: unknown) => {
        console.error('Chromium PDF indisponible', error)
        throw new HttpError(
          503,
          'Moteur PDF indisponible. Vérifiez l’installation de Chromium.',
        )
      }))
  }

  async prepare(tokens: Token[]) {
    const requests = new Map<string, GraphicSource>()
    documentMarkdown.walkTokens(tokens, (token) => {
      const input = graphicSource(token)
      if (input && canRender(input)) requests.set(graphicsKey(input), input)
    })
    if (requests.size > 300)
      throw new HttpError(
        413,
        'Maximum 300 formules ou diagrammes distincts par PDF.',
      )

    const rendered = new Map<string, Graphic>()
    if (requests.size) {
      const browser = await this.launch()
      const context = await browser.newContext({
        serviceWorkers: 'block',
        viewport: { width: 1600, height: 950 },
        deviceScaleFactor: 2,
      })
      let deadline: ReturnType<typeof setTimeout> | undefined
      try {
        const work = async () => {
          const page = await context.newPage()
          await loadPage(page)
          let bytes = 0
          for (const [key, input] of requests) {
            const dimensions = await page.evaluate((input) => {
              const render = Reflect.get(window, 'renderStudierGraphic') as (
                input: GraphicSource,
              ) => Promise<Omit<Graphic, 'png'> | null>
              return render(input)
            }, input)
            if (!dimensions) continue
            const png = await page.locator('#graphic').screenshot({
              omitBackground: true,
              timeout: 5000,
            })
            bytes += png.length
            if (bytes > 16 * 1024 * 1024)
              throw new HttpError(
                413,
                'Formules et diagrammes trop volumineux pour le PDF.',
              )
            rendered.set(key, { ...dimensions, png })
          }
        }
        await Promise.race([
          work(),
          new Promise<never>((_, reject) => {
            deadline = setTimeout(
              () =>
                reject(
                  new HttpError(
                    503,
                    'Le rendu graphique du PDF a dépassé le délai autorisé.',
                  ),
                ),
              30000,
            )
          }),
        ])
      } finally {
        clearTimeout(deadline)
        await context.close()
      }
    }
    return (input: GraphicSource) => rendered.get(graphicsKey(input))
  }

  async close() {
    const browser = await this.browser?.catch(() => undefined)
    await browser?.close()
  }
}
