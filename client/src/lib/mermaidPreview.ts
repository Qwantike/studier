import DOMPurify from 'dompurify'

export const MERMAID_LIMIT = 20000
export function validateMermaid(source: string): void {
  if (source.length > MERMAID_LIMIT)
    throw new Error('Diagramme trop long : maximum 20 000 caractères.')
  if (!source.trim())
    throw new Error('Écrivez un diagramme Mermaid dans ce bloc.')
  if (/^\s*---(?:\r?\n)|%%\s*\{/.test(source))
    throw new Error(
      'Les directives de configuration Mermaid ne sont pas autorisées.',
    )
  if (
    /<\s*(img|image|iframe|script|foreignObject|svg)\b|!\s*\[|@\{[^}]*\b(img|icon)\s*:/i.test(
      source,
    )
  )
    throw new Error(
      'Les images distantes et le HTML actif ne sont pas pris en charge dans les diagrammes.',
    )
}
let loaded: Promise<(typeof import('mermaid'))['default']> | undefined
let serial: Promise<unknown> = Promise.resolve()
let sequence = 0
const load = () =>
  (loaded ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      maxTextSize: MERMAID_LIMIT,
      maxEdges: 300,
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      secure: [
        'secure',
        'securityLevel',
        'startOnLoad',
        'maxTextSize',
        'maxEdges',
        'suppressErrorRendering',
        'htmlLabels',
      ],
    })
    return mermaid
  }))

/** Retourne un conteneur par rendu : un résultat ancien ne peut remplacer un bloc plus récent. */
export function mermaidPreview(
  language: string,
  content: string,
): HTMLElement | null {
  if (language.trim().toLowerCase() !== 'mermaid') return null
  const host = document.createElement('div')
  host.className = 'studier-mermaid'
  host.id = `studier-mermaid-preview-${++sequence}`
  // Milkdown assainit puis clone les HTMLElement : retrouver le clone monté.
  const mounted = () => document.getElementById(host.id)
  host.textContent = 'Préparation du diagramme…'
  const fail = (err: unknown) => {
    const target = mounted() ?? host
    target.textContent =
      err instanceof Error ? err.message : 'Diagramme Mermaid invalide'
    target.setAttribute('role', 'alert')
  }
  try {
    validateMermaid(content)
  } catch (err) {
    fail(err)
    return host
  }
  setTimeout(() => {
    // Milkdown remplace le conteneur à chaque frappe. On ignore les rendus déjà obsolètes.
    if (!mounted()) return
    const render = async () => {
      if (!mounted()) return
      const engine = await load()
      if (!mounted()) return
      const scratch = document.createElement('div')
      scratch.style.cssText =
        'position:absolute;left:-100000px;top:0;width:900px;pointer-events:none'
      document.body.append(scratch)
      try {
        const { svg } = await engine.render(
          `studier-mermaid-${++sequence}`,
          content,
          scratch,
        )
        if (!mounted()) return
        const clean = DOMPurify.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          FORBID_TAGS: ['foreignObject', 'script', 'image', 'a', 'use'],
        })
        const frame = document.createElement('iframe')
        frame.title = 'Diagramme Mermaid'
        frame.setAttribute('sandbox', '')
        frame.setAttribute('referrerpolicy', 'no-referrer')
        const viewBox = new DOMParser()
          .parseFromString(clean, 'image/svg+xml')
          .documentElement.getAttribute('viewBox')
          ?.split(/[ ,]+/)
          .map(Number)
        const width = viewBox?.[2],
          height = viewBox?.[3]
        const available = mounted()?.clientWidth ?? 700
        const fitted =
          width && height && Number.isFinite(width) && Number.isFinite(height)
            ? Math.max(
                160,
                Math.min(
                  900,
                  height * Math.min(1, (available - 16) / width) + 24,
                ),
              )
            : 380
        frame.style.cssText = `width:100%;height:${fitted}px;border:0;background:white;resize:vertical;overflow:auto`
        // Deuxième barrière : ni script, ni connexion réseau, ni navigation privilégiée dans l'aperçu.
        frame.srcdoc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'"><style>body{margin:8px}svg{max-width:100%;height:auto}</style></head><body>${clean}</body></html>`
        mounted()?.replaceChildren(frame)
      } finally {
        scratch.remove()
      }
    }
    serial = serial.then(render, render).catch(fail)
  }, 300)
  return host
}
