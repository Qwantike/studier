import { describe, expect, it } from 'vitest'
import { documentMarkdown } from '../services/export/inlineFormatting.js'
import { pdf } from '../services/export/documents.js'
import { NOTE_COLORS, colorOpen } from '../../../shared/noteFormatting.js'
import type { Token } from 'marked'
const collect = (tokens: Token[], type: string): Token[] =>
  tokens.flatMap((token): Token[] => [
    ...(token.type === type ? [token] : []),
    ...('tokens' in token && Array.isArray(token.tokens)
      ? collect(token.tokens, type)
      : []),
  ])
describe('mise en forme des exports', () => {
  it.each([
    '==texte==',
    '==**gras** et *italique*==',
    '==un `==` et un [lien](https://example.org/==) corrects==',
  ])('analyse le surlignage %s', (source) => {
    expect(
      collect(documentMarkdown.lexer(source), 'noteHighlight'),
    ).toHaveLength(1)
  })
  it.each([
    '\\==littéral==',
    '`==code==`',
    '```md\n==code==\n```',
    '===non===',
    '== espaces ==',
    '==incomplet',
  ])('conserve %s', (source) => {
    expect(
      collect(documentMarkdown.lexer(source), 'noteHighlight'),
    ).toHaveLength(0)
  })
  it('ne reconnaît que les spans fermés de la palette fixe', () => {
    for (const color of NOTE_COLORS)
      expect(
        collect(
          documentMarkdown.lexer(
            `${colorOpen(color.id)}**texte** ==utile==</span>`,
          ),
          'noteColor',
        )[0],
      ).toMatchObject({ color: color.id })
    for (const source of [
      '<span style="color:red">non</span>',
      `${colorOpen('blue').slice(0, -1)} onclick="alert(1)">non</span>`,
      `${colorOpen('blue')}non`,
    ])
      expect(collect(documentMarkdown.lexer(source), 'noteColor')).toHaveLength(
        0,
      )
  })
  it('conserve les formats imbriqués et les limites des spans', () => {
    const tokens = documentMarkdown.lexer(
      `${colorOpen('blue')}bleu ${colorOpen('red')}rouge</span> bleu</span> normal`,
    )
    expect(collect(tokens, 'noteColor')).toHaveLength(2)
    expect(collect(tokens, 'text').at(-1)).toMatchObject({ text: ' normal' })
  })
  it('produit des PDF paginés contenant les couleurs, fonds de surlignage et texte', async () => {
    const content =
      `# ${colorOpen('blue')}Titre</span>\n\n${colorOpen('red')}Rouge et ==surligné==</span> puis ==important **en gras**==.\n\n| Colonne |\n|---|\n| ==utile== |\n\n` +
      `==${'Très long texte à surligner avec des accents. '.repeat(100)}==`
    const buffer = await pdf({ title: 'Couleurs', content_md: content })
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(
      buffer.toString('latin1').match(/\/Type \/Page\b/g)!.length,
    ).toBeGreaterThan(1)
    // Les instructions PDF sont compressées : vérifier le contenu via les streams décompressés.
    const { inflateSync } = await import('node:zlib')
    const streams = [
      ...buffer
        .toString('latin1')
        .matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g),
    ]
      .flatMap((match) => {
        try {
          return [
            inflateSync(Buffer.from(match[1]!, 'latin1')).toString('latin1'),
          ]
        } catch {
          return []
        }
      })
      .join('\n')
    const colors = [
      ...streams.matchAll(/([0-9.]+) ([0-9.]+) ([0-9.]+) scn/g),
    ].map((match) =>
      match
        .slice(1)
        .map((value) => Number(value).toFixed(3))
        .join(' '),
    )
    expect(colors).toContain('0.725 0.110 0.110') // rouge
    expect(colors).toContain('0.996 0.941 0.541') // fond jaune
    expect(streams).not.toContain('data-note-color')
  })
})
