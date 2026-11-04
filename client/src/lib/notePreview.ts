import DOMPurify from 'dompurify'
import { parsePlot, plotSvg } from '../../../shared/functionPlot'
import { mermaidPreview } from './mermaidPreview'

export function notePreview(
  language: string,
  content: string,
): HTMLElement | null {
  if (language.trim().toLowerCase() !== 'plot')
    return mermaidPreview(language, content)
  const host = document.createElement('div')
  host.className = 'studier-plot'
  try {
    host.innerHTML = DOMPurify.sanitize(plotSvg(parsePlot(content)), {
      USE_PROFILES: { svg: true },
    })
  } catch (error) {
    host.setAttribute('role', 'alert')
    host.textContent =
      error instanceof Error ? error.message : 'Fonction invalide'
  }
  return host
}
