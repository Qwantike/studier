import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Layout from '../components/Layout'
import { OPEN_SIDEBAR_EVENT } from '../lib/uiState'

const state = vi.hoisted(() => ({ desktop: false, pathname: '/chapitres/a' }))
vi.mock('../hooks/useMediaQuery', () => ({
  useMediaQuery: () => state.desktop,
}))
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: state.pathname }),
  Outlet: () => <div>Page</div>,
}))
vi.mock('../components/Sidebar', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <button onClick={onClose}>Fermer le tiroir</button>
  ),
}))
vi.mock('../components/ThemeToggle', () => ({ default: () => null }))
vi.mock('../components/CommandPalette', () => ({ default: () => null }))
let renderer: ReactTestRenderer
beforeEach(async () => {
  state.desktop = false
  state.pathname = '/chapitres/a'
  vi.stubGlobal('window', new EventTarget())
  await act(async () => {
    renderer = create(<Layout />)
  })
})
afterEach(async () => {
  await act(async () => renderer.unmount())
  vi.unstubAllGlobals()
})
const open = () =>
  act(() =>
    renderer.root
      .findByProps({ 'aria-label': 'Ouvrir le menu' })
      .props.onClick(),
  )
it('referme le tiroir lors de la navigation sans réinitialisation dans un effet', async () => {
  open()
  expect(renderer.root.findAllByType('aside')).toHaveLength(1)
  state.pathname = '/chapitres/b'
  await act(async () => renderer.update(<Layout />))
  expect(renderer.root.findAllByType('aside')).toHaveLength(0)
  state.pathname = '/chapitres/a'
  await act(async () => renderer.update(<Layout />))
  expect(renderer.root.findAllByType('aside')).toHaveLength(0)
})
it('ne rouvre pas un ancien tiroir après un passage par le mode bureau', async () => {
  open()
  state.desktop = true
  await act(async () => renderer.update(<Layout />))
  state.desktop = false
  await act(async () => renderer.update(<Layout />))
  expect(renderer.root.findAllByType('aside')).toHaveLength(0)
})
it('conserve l’ouverture par événement et la fermeture par Échap', () => {
  act(() => {
    window.dispatchEvent(new Event(OPEN_SIDEBAR_EVENT))
  })
  expect(renderer.root.findAllByType('aside')).toHaveLength(1)
  const event = new Event('keydown')
  Object.defineProperty(event, 'key', { value: 'Escape' })
  act(() => {
    window.dispatchEvent(event)
  })
  expect(renderer.root.findAllByType('aside')).toHaveLength(0)
})
