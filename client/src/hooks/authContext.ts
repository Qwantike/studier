import { createContext } from 'react'

export interface AuthUser {
  id: string
  email: string
  display_name: string
  created_at: string
}
export type Status = 'loading' | 'error' | 'anonymous' | 'authenticated'

export interface AuthContextValue {
  status: Status
  user: AuthUser | null
  retry: () => void
  login: (email: string, password: string) => Promise<void>
  register: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<void>
  logout: () => Promise<void>
  /** Met à jour l'utilisateur en mémoire (après modification du profil). */
  setUser: (user: AuthUser) => void
  /** Efface la session locale (après suppression du compte ou déconnexion de tous les appareils). */
  endSession: () => void
}

export const ME_KEY = ['me'] as const
export const AuthContext = createContext<AuthContextValue | null>(null)
