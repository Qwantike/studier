import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { archive } from '../services/export/archive.js'
import type { Snapshot } from '../services/export/data.js'
import { REVIEW_MODEL } from '../../../shared/reviewModel.js'
import { markdown, pdf } from '../services/export/documents.js'
import { documentMarkdown } from '../services/export/inlineFormatting.js'
import { graphicSource } from '../services/export/pdfGraphics.js'

const fence = '~~~'
const chapter = {
  title: 'Rendu scientifique',
  content_md: [
    String.raw`La vitesse $v = \frac{dx}{dt}$ est une dérivée.`,
    '',
    String.raw`$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$`,
    '',
    fence + 'LaTeX',
    String.raw`\int_0^1 x^2\,dx = \frac{1}{3}`,
    fence,
    '',
    fence + 'mermaid',
    'flowchart LR',
    '  A[Observation] --> B[Hypothèse]',
    fence,
    '',
    'Le texte après le diagramme reste sélectionnable.',
  ].join('\n'),
}

const imagesIn = (buffer: Uint8Array) =>
  Buffer.from(buffer)
    .toString('latin1')
    .match(/\/ColorSpace \/DeviceRGB\b/g)?.length ?? 0

describe('syntaxe scientifique des PDF', () => {
  it('reconnaît les syntaxes importées et celles produites par Milkdown', () => {
    const graphics: string[] = []
    const tokens = documentMarkdown.lexer(
      markdown({
        ...chapter,
        content_md: chapter.content_md + '\n\n$$\n\\sqrt{x}\n$$',
      }),
    )
    documentMarkdown.walkTokens(tokens, (token) => {
      const input = graphicSource(token)
      if (input) graphics.push(input.kind + ':' + input.source)
    })
    expect(graphics).toEqual([
      String.raw`inline:v = \frac{dx}{dt}`,
      String.raw`display:\sum_{i=1}^{n} i = \frac{n(n+1)}{2}`,
      String.raw`display:\int_0^1 x^2\,dx = \frac{1}{3}`,
      'mermaid:flowchart LR\n  A[Observation] --> B[Hypothèse]',
      String.raw`display:\sqrt{x}`,
    ])
  })

  it('n’interprète ni le code ordinaire ni les dollars échappés', () => {
    const content = [
      'exemple `$x$`',
      String.raw`\$x\$ et un prix de $12 suivi de $20.`,
      '',
      fence + 'text',
      '$$',
      'x+2',
      '$$',
      fence,
    ].join('\n')
    const graphics: unknown[] = []
    documentMarkdown.walkTokens(documentMarkdown.lexer(content), (token) => {
      const input = graphicSource(token)
      if (input) graphics.push(input)
    })
    expect(graphics).toEqual([])
  })
})

describe('rendu scientifique des PDF', () => {
  it('incorpore la formule en ligne, les deux blocs math et le diagramme', async () => {
    const result = await pdf(chapter)
    expect(result.subarray(0, 5).toString()).toBe('%PDF-')
    expect(imagesIn(result)).toBe(4)
  }, 45000)

  it('conserve les formules et diagrammes invalides sans perdre les blocs valides suivants', async () => {
    const result = await pdf({
      title: 'Repli',
      content_md: [
        String.raw`Formule incorrecte $\notAValidCommand{x}$`,
        '',
        fence + 'mermaid',
        'not a Mermaid diagram',
        fence,
        '',
        fence + 'mermaid',
        'flowchart LR',
        '  A --> B',
        fence,
      ].join('\n'),
    })
    expect(imagesIn(result)).toBe(1)
  }, 45000)

  it('incorpore les mêmes graphiques dans le ZIP et laisse la source dans le MD', async () => {
    const snapshot: Snapshot = {
      version: 4,
      review_model: REVIEW_MODEL,
      exported_at: '2026-11-17T00:00:00.000Z',
      tables: {
        users: [],
        years: [{ id: '00000000-0000-4000-8000-000000000001', label: 'Année' }],
        semesters: [
          {
            id: '00000000-0000-4000-8000-000000000002',
            year_id: '00000000-0000-4000-8000-000000000001',
            label: 'Semestre',
          },
        ],
        subjects: [
          {
            id: '00000000-0000-4000-8000-000000000003',
            semester_id: '00000000-0000-4000-8000-000000000002',
            name: 'Matière',
          },
        ],
        chapters: [
          {
            ...chapter,
            id: '00000000-0000-4000-8000-000000000004',
            subject_id: '00000000-0000-4000-8000-000000000003',
          },
        ],
        evaluations: [],
        evaluation_chapters: [],
        calendar_events: [],
        calendar_sources: [],
        sessions: [],
        whiteboards: [],
        note_images: [],
        reviews: [],
      },
    }
    const files = unzipSync(await archive(snapshot, ['md', 'pdf']))
    const entries = Object.entries(files)
    expect(imagesIn(entries.find(([name]) => name.endsWith('.pdf'))![1])).toBe(
      4,
    )
    expect(strFromU8(entries.find(([name]) => name.endsWith('.md'))![1])).toBe(
      markdown(chapter),
    )
  }, 45000)
})
