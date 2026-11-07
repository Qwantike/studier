import { commandsCtx, editorViewCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import { toggleMark } from '@milkdown/kit/prose/commands'
import { markRule } from '@milkdown/kit/prose'
import { Plugin } from '@milkdown/kit/prose/state'
import {
  $prose,
  $command,
  $inputRule,
  $markSchema,
  $remark,
  $useKeymap,
} from '@milkdown/kit/utils'
import {
  NOTE_COLORS,
  noteColor,
  type NoteColor,
} from '../../../shared/noteFormatting'
import { remarkNoteFormatting } from './remarkNoteFormatting'

export const highlightSchema = $markSchema('note_highlight', () => ({
  parseDOM: [{ tag: 'mark' }],
  toDOM: () => ['mark', { class: 'note-highlight' }, 0],
  parseMarkdown: {
    match: (node) => node.type === 'noteHighlight',
    runner: (state, node, type) => {
      state.openMark(type)
      state.next(node.children)
      state.closeMark(type)
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'note_highlight',
    runner: (state, mark) => {
      state.withMark(mark, 'noteHighlight')
    },
  },
}))
export const colorSchema = $markSchema('note_color', () => ({
  attrs: { color: { default: 'blue', validate: 'string' } },
  parseDOM: [
    {
      tag: 'span[data-note-color]',
      getAttrs: (node) => {
        const color = noteColor(node.getAttribute('data-note-color'))
        return color ? { color: color.id } : false
      },
    },
  ],
  toDOM: (mark) => [
    'span',
    { 'data-note-color': noteColor(mark.attrs.color)?.id ?? 'blue' },
    0,
  ],
  parseMarkdown: {
    match: (node) => node.type === 'noteColor',
    runner: (state, node, type) => {
      state.openMark(type, { color: node.color })
      state.next(node.children)
      state.closeMark(type)
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'note_color',
    runner: (state, mark) => {
      state.withMark(mark, 'noteColor', undefined, {
        color: noteColor(mark.attrs.color)?.id ?? 'blue',
      })
    },
  },
}))
export const toggleHighlight = $command(
  'ToggleNoteHighlight',
  (ctx) => () => toggleMark(highlightSchema.type(ctx)),
)
export const setNoteColor = $command(
  'SetNoteColor',
  (ctx) =>
    (color: NoteColor | null = null) =>
    (state, dispatch) => {
      if (color !== null && !noteColor(color)) return false
      const type = colorSchema.type(ctx),
        { from, to, empty } = state.selection
      if (!empty) {
        const tr = state.tr.removeMark(from, to, type)
        if (color) tr.addMark(from, to, type.create({ color }))
        dispatch?.(tr.scrollIntoView())
      } else {
        const tr = state.tr.removeStoredMark(type)
        if (color) tr.addStoredMark(type.create({ color }))
        dispatch?.(tr)
      }
      return true
    },
)
const input = $inputRule((ctx) =>
  markRule(
    /(?<![\\=])==(?=\S)((?:[^=\n]|=(?!=))*?\S)==$/,
    highlightSchema.type(ctx),
  ),
)
export const formattingKeys = $useKeymap('noteFormattingKeys', {
  ToggleHighlight: {
    shortcuts: 'Mod-Shift-h',
    command: (ctx) => () => {
      const view = ctx.get(editorViewCtx)
      return toggleMark(highlightSchema.type(ctx))(view.state, view.dispatch)
    },
  },
})
export function colorSelected(ctx: Ctx, id: NoteColor | null): boolean {
  const { state } = ctx.get(editorViewCtx),
    { from, to } = state.selection,
    type = colorSchema.type(ctx)
  let seen = false,
    all = true
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return
    seen = true
    if (
      (node.marks.find((mark) => mark.type === type)?.attrs.color ?? null) !==
      id
    )
      all = false
  })
  return seen && all
}
// Crepe active ses boutons au pointeur ; compléter Entrée/Espace pour nos commandes.
const toolbarKeyboard = $prose(
  (ctx) =>
    new Plugin({
      view: (view) => {
        const root = view.dom.parentElement
        const keydown = (event: KeyboardEvent) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          const target = event.target
          if (
            !(target instanceof HTMLButtonElement) ||
            !target.closest('.milkdown-toolbar')
          )
            return
          const item = target.dataset.toolbarItem
          if (item === 'highlight')
            ctx.get(commandsCtx).call(toggleHighlight.key)
          else if (item === 'color-default')
            ctx.get(commandsCtx).call(setNoteColor.key, null)
          else if (item?.startsWith('color-') && noteColor(item.slice(6)))
            ctx
              .get(commandsCtx)
              .call(setNoteColor.key, item.slice(6) as NoteColor)
          else return
          event.preventDefault()
          view.focus()
        }
        root?.addEventListener('keydown', keydown)
        return { destroy: () => root?.removeEventListener('keydown', keydown) }
      },
    }),
)
export const noteFormatting = [
  highlightSchema,
  colorSchema,
  $remark('noteFormattingRemark', () => remarkNoteFormatting),
  toggleHighlight,
  setNoteColor,
  input,
  formattingKeys,
  toolbarKeyboard,
].flat()
export { NOTE_COLORS }
