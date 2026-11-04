/** Identifiants stables dans le Markdown ; seules ces couleurs sont acceptées. */
export const NOTE_COLORS = [
  { id: 'red', label: 'Rouge', light: '#b91c1c', dark: '#fca5a5' },
  { id: 'orange', label: 'Orange', light: '#9a3412', dark: '#fdba74' },
  { id: 'green', label: 'Vert', light: '#047857', dark: '#6ee7b7' },
  { id: 'blue', label: 'Bleu', light: '#1d4ed8', dark: '#93c5fd' },
  { id: 'purple', label: 'Violet', light: '#7e22ce', dark: '#d8b4fe' },
  { id: 'pink', label: 'Rose', light: '#be185d', dark: '#f9a8d4' },
] as const
export type NoteColor = (typeof NOTE_COLORS)[number]['id']
export const noteColor = (id: unknown) =>
  NOTE_COLORS.find((color) => color.id === id)
export const HIGHLIGHT_BACKGROUND = '#fef08a'
export const HIGHLIGHT_TEXT = '#422006'

export function colorOpen(id: NoteColor): string {
  const color = noteColor(id)!
  return `<span data-note-color="${color.id}" style="color: ${color.light}">`
}
/** Une seule forme HTML contrôlée, jamais de style, classe ou attribut arbitraire. */
export function parseColorOpen(value: string): NoteColor | null {
  const match =
    /^<span\s+data-note-color="([a-z]+)"\s+style="color:\s*(#[0-9a-f]{6})\s*;?"\s*>$/i.exec(
      value,
    )
  if (!match) return null
  const color = noteColor(match[1])
  return color && color.light === match[2]!.toLowerCase() ? color.id : null
}
