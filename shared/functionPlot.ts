/** Petit interpréteur numérique : ni eval, ni Function, ni accès aux objets JavaScript. */
type Node =
  | { kind: 'number'; value: number }
  | { kind: 'x' }
  | { kind: 'unary'; sign: number; arg: Node }
  | { kind: 'binary'; op: string; left: Node; right: Node }
  | { kind: 'call'; name: string; arg: Node }
const functions: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log,
  log10: Math.log10,
  floor: Math.floor,
  ceil: Math.ceil,
}
export function compileFunction(expression: string): (x: number) => number {
  if (expression.length > 200)
    throw new Error('Expression trop longue (200 caractères maximum).')
  const tokens =
    expression.match(
      /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z][A-Za-z0-9]*|\*\*|[^\s]/g,
    ) ?? []
  if (!tokens.length || tokens.length > 128)
    throw new Error('Expression vide ou trop complexe.')
  let position = 0
  const parse = (minimum = 0, depth = 0): Node => {
    if (depth > 32) throw new Error('Expression trop imbriquée.')
    const token = tokens[position++]
    let node: Node
    if (token === '+' || token === '-')
      node = {
        kind: 'unary',
        sign: token === '-' ? -1 : 1,
        arg: parse(30, depth + 1),
      }
    else if (token === '(') {
      node = parse(0, depth + 1)
      if (tokens[position++] !== ')')
        throw new Error('Parenthèse fermante manquante.')
    } else if (
      token &&
      /^(?:\d|\.)/.test(token) &&
      Number.isFinite(Number(token))
    )
      node = { kind: 'number', value: Number(token) }
    else if (token === 'x') node = { kind: 'x' }
    else if (token === 'pi' || token === 'e')
      node = { kind: 'number', value: token === 'pi' ? Math.PI : Math.E }
    else if (token && Object.hasOwn(functions, token)) {
      if (tokens[position++] !== '(') throw new Error(`Utilisez ${token}(x).`)
      const arg = parse(0, depth + 1)
      if (tokens[position++] !== ')')
        throw new Error('Parenthèse fermante manquante.')
      node = { kind: 'call', name: token, arg }
    } else
      throw new Error(
        `Symbole non autorisé : ${token ?? 'fin de l’expression'}. Utilisez x, pi, e et les fonctions proposées.`,
      )
    while (position < tokens.length) {
      const op = tokens[position]!,
        precedence = (
          { '+': 10, '-': 10, '*': 20, '/': 20, '^': 40, '**': 40 } as Record<
            string,
            number
          >
        )[op]
      if (precedence === undefined || precedence < minimum) break
      position++
      node = {
        kind: 'binary',
        op,
        left: node,
        right: parse(
          precedence + (op === '^' || op === '**' ? 0 : 1),
          depth + 1,
        ),
      }
    }
    return node
  }
  const tree = parse()
  if (position !== tokens.length)
    throw new Error(
      `Syntaxe inattendue : ${tokens[position]}. Écrivez par exemple 2*x, avec un signe *.`,
    )
  const evaluate = (node: Node, x: number): number => {
    switch (node.kind) {
      case 'number':
        return node.value
      case 'x':
        return x
      case 'unary':
        return node.sign * evaluate(node.arg, x)
      case 'call':
        return functions[node.name]!(evaluate(node.arg, x))
      case 'binary': {
        const a = evaluate(node.left, x),
          b = evaluate(node.right, x)
        switch (node.op) {
          case '+':
            return a + b
          case '-':
            return a - b
          case '*':
            return a * b
          case '/':
            return a / b
          default:
            return a ** b
        }
      }
    }
  }
  return (x) => evaluate(tree, x)
}
export interface PlotConfig {
  expressions: string[]
  x: [number, number]
  y: [number, number]
  title: string
}
export function parsePlot(source: string): PlotConfig {
  if (source.length > 4000)
    throw new Error('Bloc de fonctions trop long (4 000 caractères maximum).')
  const config: PlotConfig = {
    expressions: [],
    x: [-5, 5],
    y: [-5, 5],
    title: 'Courbes de fonctions',
  }
  const seen = new Set<string>()
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const range = /^(x|y)\s*:\s*(.+)$/i.exec(line)
    if (range) {
      const axis = range[1]!.toLowerCase() as 'x' | 'y'
      if (seen.has(axis)) throw new Error(`Axe ${axis} défini plusieurs fois.`)
      seen.add(axis)
      const parts = range[2]!
        .split(',')
        .map((v) => (v.trim() ? Number(v.trim()) : NaN))
      if (
        parts.length !== 2 ||
        !parts.every(Number.isFinite) ||
        parts.some((v) => Math.abs(v) > 1e6) ||
        parts[1]! - parts[0]! < 1e-6
      )
        throw new Error(
          `Bornes invalides pour ${axis} : utilisez ${axis}: -5, 5 (ordre croissant).`,
        )
      config[axis] = parts as [number, number]
    } else if (/^title\s*:/i.test(line))
      config.title = line.replace(/^title\s*:\s*/i, '').slice(0, 150)
    else {
      const expression = line.replace(/^(?:[fgh]\(x\)|y)\s*=\s*/i, '')
      compileFunction(expression)
      config.expressions.push(expression)
    }
  }
  if (!config.expressions.length || config.expressions.length > 5)
    throw new Error('Ajoutez entre une et cinq fonctions, une par ligne.')
  return config
}
export const PLOT_COLORS = [
  '#2563eb',
  '#dc2626',
  '#059669',
  '#9333ea',
  '#d97706',
]
export const PLOT_WIDTH = 640,
  PLOT_HEIGHT = 450
export function plotGeometry(config: PlotConfig) {
  const left = 58,
    top = 40,
    width = 560,
    height = 300
  const sx = (x: number) =>
    left + ((x - config.x[0]) / (config.x[1] - config.x[0])) * width
  const sy = (y: number) =>
    top + height - ((y - config.y[0]) / (config.y[1] - config.y[0])) * height
  const ticks = (range: [number, number]) => {
    const base = 10 ** Math.floor(Math.log10((range[1] - range[0]) / 6))
    const ratio = (range[1] - range[0]) / 6 / base,
      step = (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * base
    const values: number[] = []
    for (
      let i = Math.ceil(range[0] / step);
      i * step <= range[1] + step * 1e-9 && values.length < 20;
      i++
    )
      values.push(Number((i * step).toPrecision(10)))
    return values
  }
  const curves = config.expressions.map((expression, index) => {
    const f = compileFunction(expression),
      segments: [number, number][][] = []
    let segment: [number, number][] = []
    for (let i = 0; i <= 800; i++) {
      const x = config.x[0] + (i / 800) * (config.x[1] - config.x[0]),
        y = f(x)
      if (!Number.isFinite(y) || y < config.y[0] || y > config.y[1]) {
        if (segment.length) segments.push(segment)
        segment = []
        continue
      }
      const point: [number, number] = [sx(x), sy(y)]
      if (
        segment.length &&
        Math.abs(point[1] - segment[segment.length - 1]![1]) > height / 2
      ) {
        segments.push(segment)
        segment = []
      }
      segment.push(point)
    }
    if (segment.length) segments.push(segment)
    return { expression, color: PLOT_COLORS[index]!, segments }
  })
  return {
    left,
    top,
    width,
    height,
    xTicks: ticks(config.x).map((v) => ({ value: v, position: sx(v) })),
    yTicks: ticks(config.y).map((v) => ({ value: v, position: sy(v) })),
    zeroX: config.x[0] <= 0 && config.x[1] >= 0 ? sx(0) : null,
    zeroY: config.y[0] <= 0 && config.y[1] >= 0 ? sy(0) : null,
    curves,
  }
}
const xml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
export function plotSvg(config: PlotConfig): string {
  const g = plotGeometry(config)
  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color = '#e2e8f0',
  ) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${color}" fill="none"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${xml(config.title)}" viewBox="0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}" style="width:100%;height:auto;background:white;font:12px sans-serif"><title>${xml(config.title)}</title><rect width="640" height="450" fill="white"/><text x="320" y="22" text-anchor="middle" fill="#0f172a" font-size="16">${xml(config.title)}</text>${g.xTicks.map((t) => line(t.position, g.top, t.position, g.top + g.height) + `<text x="${t.position}" y="360" text-anchor="middle" fill="#475569">${t.value}</text>`).join('')}${g.yTicks.map((t) => line(g.left, t.position, g.left + g.width, t.position) + `<text x="50" y="${t.position + 4}" text-anchor="end" fill="#475569">${t.value}</text>`).join('')}${g.zeroX !== null ? line(g.zeroX, g.top, g.zeroX, g.top + g.height, '#64748b') : ''}${g.zeroY !== null ? line(g.left, g.zeroY, g.left + g.width, g.zeroY, '#64748b') : ''}<rect x="${g.left}" y="${g.top}" width="${g.width}" height="${g.height}" fill="none" stroke="#94a3b8"/>${g.curves
    .map((c) =>
      c.segments
        .filter((s) => s.length > 1)
        .map(
          (s) =>
            `<path fill="none" stroke="${c.color}" stroke-width="2" d="${s.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('')}"/>`,
        )
        .join(''),
    )
    .join(
      '',
    )}${g.curves.map((c, i) => `<text x="58" y="${378 + i * 13}" fill="${c.color}" font-size="11">${xml(c.expression)}</text>`).join('')}</svg>`
}
