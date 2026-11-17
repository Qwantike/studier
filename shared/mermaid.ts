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
