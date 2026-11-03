import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { ApiError, UNAUTHORIZED_EVENT, api } from '../api/client'
import {
  AuthContext,
  ME_KEY,
  type AuthUser,
  type AuthContextValue,
} from './authContext'
import { setStorageScope } from '../lib/persistedStore'

// Retire du cache tout ce qui dépend d'un utilisateur (arbre, chapitres, évaluations…), sauf l'identité.
const dropUserData = (qc: QueryClient) =>
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] })

async function fetchMe(): Promise<AuthUser | null> {
  try {
    return await api<AuthUser>('/auth/me')
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null
    throw err // serveur injoignable : on propose de réessayer plutôt que d'afficher la connexion
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    staleTime: Infinity,
    retry: false,
  })
  const user = me.data ?? null

  // Les stores d'interface sont propres à l'utilisateur ; réglé avant le rendu des écrans connectés.
  setStorageScope(user?.id ?? '')

  const endSession = useCallback(() => {
    qc.setQueryData(ME_KEY, null)
    dropUserData(qc)
  }, [qc])

  // Session perdue (refresh refusé, autre onglet déconnecté…) : retour à la page de connexion.
  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, endSession)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, endSession)
  }, [endSession])

  const login = useCallback(
    async (email: string, password: string) => {
      const u = await api<AuthUser>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      dropUserData(qc)
      qc.setQueryData(ME_KEY, u)
    },
    [qc],
  )

  const register = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const u = await api<AuthUser>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          display_name: displayName || undefined,
        }),
      })
      dropUserData(qc)
      qc.setQueryData(ME_KEY, u)
    },
    [qc],
  )

  const logout = useCallback(async () => {
    // L'interface repasse d'abord en « déconnecté » : le chapitre ouvert envoie sa dernière sauvegarde au démontage,
    // pendant que la requête de déconnexion est encore en vol.
    qc.setQueryData(ME_KEY, null)
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    dropUserData(qc)
  }, [qc])

  const setUser = useCallback(
    (u: AuthUser) => {
      qc.setQueryData(ME_KEY, u)
    },
    [qc],
  )

  const { isPending, isError, refetch } = me
  const retry = useCallback(() => {
    void refetch()
  }, [refetch])

  const value = useMemo<AuthContextValue>(
    () => ({
      status: isPending
        ? 'loading'
        : isError
          ? 'error'
          : user
            ? 'authenticated'
            : 'anonymous',
      user,
      retry,
      login,
      register,
      logout,
      setUser,
      endSession,
    }),
    [
      isPending,
      isError,
      retry,
      user,
      login,
      register,
      logout,
      setUser,
      endSession,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
