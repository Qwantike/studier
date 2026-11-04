import { describe, expect, it } from 'vitest'
import { validateMermaid, MERMAID_LIMIT } from '../lib/mermaidPreview'

describe('blocs Mermaid', () => {
  it('accepte les diagrammes Markdown standards', () => {
    expect(() =>
      validateMermaid('flowchart TD\n A[Idée] --> B[Résultat]'),
    ).not.toThrow()
    expect(() =>
      validateMermaid('sequenceDiagram\n Alice->>Bob: Bonjour'),
    ).not.toThrow()
  })
  it('refuse les directives susceptibles de modifier les réglages de sécurité', () => {
    expect(() =>
      validateMermaid('%%{init: {"securityLevel":"loose"}}%%\nflowchart TD'),
    ).toThrow('directives')
    expect(() => validateMermaid('---\nconfig:\n---\nflowchart TD')).toThrow(
      'directives',
    )
  })
  it('refuse les contenus HTML actifs et les images externes', () => {
    for (const source of [
      'flowchart TD\nA[<img src=x>]',
      'flowchart TD\nA@{ img: "https://example.org/x" }',
      'flowchart TD\nA[![x](https://example.org/x)]',
    ])
      expect(() => validateMermaid(source)).toThrow('images distantes')
  })
  it('borne la longueur et explique un bloc vide', () => {
    expect(() => validateMermaid('x'.repeat(MERMAID_LIMIT + 1))).toThrow(
      'trop long',
    )
    expect(() => validateMermaid(' ')).toThrow('Écrivez')
  })
})
