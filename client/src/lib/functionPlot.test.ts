import { describe, expect, it } from 'vitest'
import {
  compileFunction,
  parsePlot,
  plotGeometry,
  plotSvg,
} from '../../../shared/functionPlot'

describe('interpréteur numérique borné', () => {
  it.each([
    ['-x^2', 3, -9],
    ['2^-2', 0, 0.25],
    ['2^3^2', 0, 512],
    ['2*x+1', 3, 7],
    ['sin(pi/2)', 0, 1],
    ['ln(e)', 0, 1],
    ['sqrt(abs(x))', -9, 3],
    ['log10(100)', 0, 2],
    ['1e-3*x', 1000, 1],
  ])('respecte la priorité de %s', (source, x, result) => {
    expect(compileFunction(source)(x)).toBeCloseTo(result)
  })
  it.each([
    'window.alert(1)',
    'constructor(x)',
    'x=1',
    'x[0]',
    'sin(x);fetch(x)',
    '2x',
    'sin x',
    '(',
    'x'.repeat(201),
    '('.repeat(40) + 'x' + ')'.repeat(40),
  ])('refuse %s', (source) => {
    expect(() => compileFunction(source)).toThrow()
  })
  it('lit plusieurs courbes et les bornes ; rejette les configurations invalides', () => {
    expect(
      parsePlot('f(x) = sin(x)\nx^2\nx: -4, 4\ny: -2, 8').expressions,
    ).toEqual(['sin(x)', 'x^2'])
    for (const source of [
      '',
      'x\nx: 5, -5',
      'x\nx: ,5',
      'x\ny: 0, Infinity',
      'x\nx: 0, 1\nx: 0, 2',
      'x\n'.repeat(6),
    ])
      expect(() => parsePlot(source)).toThrow()
  })
  it('coupe les courbes hors domaine et ne relie pas les deux branches de 1/x', () => {
    const g = plotGeometry(parsePlot('1/x\nsqrt(x)\nx: -5, 5\ny: -5, 5'))
    expect(g.curves[0]!.segments.length).toBeGreaterThanOrEqual(2)
    for (const segment of g.curves[0]!.segments)
      expect(
        segment.every((p) => p[0] <= g.zeroX!) ||
          segment.every((p) => p[0] >= g.zeroX!),
      ).toBe(true)
    expect(g.curves[1]!.segments.flat().every((p) => p[0] >= g.zeroX!)).toBe(
      true,
    )
    expect(
      g.curves
        .flatMap((c) => c.segments.flat())
        .flat()
        .every(Number.isFinite),
    ).toBe(true)
  })
  it('échappe le titre et conserve des SVG autonomes', () => {
    const svg = plotSvg(parsePlot('x\ntitle: <script>alert(1)</script>'))
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script&gt;')
    expect(svg).toContain('<path')
    expect(svg).not.toContain('href=')
  })
})
