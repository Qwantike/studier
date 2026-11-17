/* Loaded only inside the isolated print page. The chapter is never HTML input. */
const host = document.getElementById('graphic')
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  suppressErrorRendering: true,
  theme: 'default',
  maxTextSize: 20000,
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

window.renderStudierGraphic = async ({ kind, source }) => {
  host.replaceChildren()
  host.style.cssText = ''
  const baseline = document.createElement('span')
  baseline.style.cssText = 'display:inline-block;width:0;height:0'
  if (kind === 'mermaid') {
    try {
      const { svg } = await mermaid.render('studier-pdf-diagram', source, host)
      host.innerHTML = DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
        FORBID_TAGS: ['foreignObject', 'script', 'image', 'a', 'use'],
      })
    } catch {
      return null
    }
    const svg = host.querySelector('svg')
    const box = svg?.viewBox.baseVal
    if (!box?.width || !box.height) return null
    const scale = Math.min(1, 1000 / box.width, 640 / box.height)
    svg.style.cssText = 'display:block;max-width:none'
    svg.setAttribute('width', String(box.width * scale))
    svg.setAttribute('height', String(box.height * scale))
  } else {
    const formula = document.createElement('span')
    try {
      katex.render(source, formula, {
        output: 'html',
        displayMode: kind === 'display',
        throwOnError: true,
        trust: false,
        maxExpand: 500,
        maxSize: 20,
      })
    } catch {
      return null
    }
    host.style.fontSize = kind === 'inline' ? '16px' : '19.2px'
    host.append(formula, baseline)
  }
  // Force layout so document.fonts.ready waits for the fonts just requested.
  host.getBoundingClientRect()
  await document.fonts.ready
  const { width, height, top } = host.getBoundingClientRect()
  if (width <= 0 || height <= 0 || width > 1550 || height > 900) return null
  return {
    width,
    height,
    ascent:
      kind === 'inline' ? baseline.getBoundingClientRect().top - top : height,
  }
}
