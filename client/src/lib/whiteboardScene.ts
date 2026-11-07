import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

export interface Scene {
  type: 'excalidraw'
  version: 2
  source: string
  elements: readonly ExcalidrawElement[]
  appState: Pick<
    Partial<AppState>,
    'viewBackgroundColor' | 'scrollX' | 'scrollY' | 'zoom' | 'gridSize'
  >
  files: BinaryFiles
}
export interface Whiteboard {
  id: string
  user_id: string
  subject_id: string | null
  chapter_id: string | null
  title: string
  revision: number
  scene_bytes: number
  created_at: string
  updated_at: string
}
export interface WhiteboardDetail extends Whiteboard {
  scene: Scene
}
export interface BoardUsage {
  bytes: number
  count: number
  scene_limit: number
  account_limit: number
  board_limit: number
}
export const SCENE_LIMIT = 2 * 1024 * 1024
export const sceneBytes = (scene: Scene) =>
  new TextEncoder().encode(JSON.stringify(scene)).length

export function makeScene(
  elements: readonly ExcalidrawElement[],
  state: AppState,
  files: BinaryFiles,
): Scene {
  const live = elements.filter((e) => !e.isDeleted)
  const used = new Set<string | null>(
    live.filter((e) => e.type === 'image').map((e) => e.fileId),
  )
  return {
    type: 'excalidraw',
    version: 2,
    source: 'studier',
    elements: live,
    appState: {
      viewBackgroundColor: state.viewBackgroundColor,
      scrollX: state.scrollX,
      scrollY: state.scrollY,
      zoom: state.zoom,
      gridSize: state.gridSize,
    },
    files: Object.fromEntries(
      Object.entries(files).filter(([id]) => used.has(id)),
    ),
  }
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
