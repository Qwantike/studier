import { describe, expect, it } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import remarkGfm from 'remark-gfm'
import type { Root, RootContent } from 'mdast'
import { remarkNoteFormatting } from './remarkNoteFormatting'
import {
  NOTE_COLORS,
  colorOpen,
  parseColorOpen,
} from '../../../shared/noteFormatting'
const processor = () =>
  unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkStringify)
    .use(remarkNoteFormatting, {})
const parse = (source: string) => {
  const p = processor()
  return p.runSync(p.parse(source)) as Root
}
const find = (tree: Root | RootContent, type: string): RootContent[] => [
  ...(tree.type === type ? [tree as RootContent] : []),
  ...('children' in tree
    ? tree.children.flatMap((node) => find(node, type))
    : []),
]
const strip = (tree: Root | RootContent): unknown =>
  JSON.parse(
    JSON.stringify(tree, (key, value) =>
      key === 'position' ? undefined : value,
    ),
  )
describe('surlignage et couleurs en Markdown', () => {
  it.each([
    '==texte==',
    'Avant ==**gras** et *italique*== après',
    '# ==Titre==',
    '- ==item==',
    '| A |\n|---|\n| ==table== |',
    '==[lien](https://example.org)==',
    '==un `code` et du texte==',
  ])('reconnaît %s', (source) => {
    expect(find(parse(source), 'noteHighlight')).toHaveLength(1)
  })
  it.each([
    '\\==texte==',
    '`==code==`',
    '```md\n==code==\n```',
    '===pas de marque===',
    '== espace ==',
    'x = y',
    '==incomplet',
  ])('préserve le texte/code %s', (source) => {
    expect(find(parse(source), 'noteHighlight')).toHaveLength(0)
  })
  it('ne ferme pas une marque dans du code ou une URL', () => {
    const tree = parse(
      '==un `==` et un [lien](https://example.org/==) corrects==',
    )
    expect(find(tree, 'noteHighlight')).toHaveLength(1)
    expect(find(tree, 'inlineCode')[0]).toMatchObject({ value: '==' })
    expect(find(tree, 'link')[0]).toMatchObject({
      url: 'https://example.org/==',
    })
  })
  it('conserve une couleur, les formats imbriqués et le surlignage au round-trip', () => {
    for (const color of NOTE_COLORS) {
      const source = `Avant ${colorOpen(color.id)}**important** et ==utile==</span> après`
      const p = processor(),
        tree = parse(source),
        md = p.stringify(tree)
      expect(find(tree, 'noteColor')[0]).toMatchObject({ color: color.id })
      expect(md).toContain(colorOpen(color.id))
      expect(md).toContain('==utile==')
      expect(strip(parse(md))).toEqual(strip(tree))
    }
  })
  it('protège les = littéraux sans encombrer les égalités simples', () => {
    const tree = parse('x=2 ; \\==littéral==')
    const md = processor().stringify(tree)
    expect(md).toContain('x=2')
    expect(find(parse(md), 'noteHighlight')).toHaveLength(0)
    expect(strip(parse(md))).toEqual(strip(tree))
  })
  it('ne reconnaît ni styles arbitraires, ni attributs actifs, ni spans non fermés', () => {
    for (const source of [
      '<span style="color:red">non</span>',
      '<span data-note-color="blue" style="color: #000000">non</span>',
      `${colorOpen('blue').slice(0, -1)} onclick="alert(1)">non</span>`,
      `${colorOpen('blue')}incomplet`,
    ])
      expect(find(parse(source), 'noteColor')).toHaveLength(0)
    expect(parseColorOpen(colorOpen('blue'))).toBe('blue')
    expect(
      parseColorOpen('<span data-note-color="alien" style="color: #1d4ed8">'),
    ).toBeNull()
  })
  it('garde un contraste de 4,5:1 sur les fonds clairs, sombres et surlignés', () => {
    const luminance = (hex: string) => {
      const values = hex
        .match(/[0-9a-f]{2}/gi)!
        .map((value) => parseInt(value, 16) / 255)
        .map((value) =>
          value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
        )
      return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722
    }
    const contrast = (a: string, b: string) =>
      (Math.max(luminance(a), luminance(b)) + 0.05) /
      (Math.min(luminance(a), luminance(b)) + 0.05)
    for (const color of NOTE_COLORS) {
      expect(contrast(color.light, '#ffffff')).toBeGreaterThanOrEqual(4.5)
      expect(contrast(color.dark, '#18181b')).toBeGreaterThanOrEqual(4.5)
      expect(contrast(color.light, '#fef08a')).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('apparie les spans imbriqués sans absorber le texte suivant', () => {
    const tree = parse(
      `${colorOpen('blue')}bleu ${colorOpen('red')}rouge</span> bleu</span> normal`,
    )
    expect(find(tree, 'noteColor')).toHaveLength(2)
    expect(strip(parse(processor().stringify(tree)))).toEqual(strip(tree))
  })
})
