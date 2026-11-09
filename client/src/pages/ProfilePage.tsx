import { useState, type FormEvent, type ReactNode } from 'react'
import NoteImagesPanel from '../components/NoteImagesPanel'
import ExportPanel from '../components/ExportPanel'
import { api } from '../api/client'
import { useAuth, type AuthUser } from '../hooks/useAuth'
import { useEffect } from 'react'

type AiProvider = 'openai' | 'gemini'

const field =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900'
const label = 'mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400'
const primary =
  'rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60'

const AI_MODELS: Record<AiProvider, { id: string, label: string }[]> = {
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini (Le plus économique)' },
    { id: 'gpt-5-turbo', label: 'GPT-5 Turbo (Excellent compromis)' },
    { id: 'gpt-6-astra', label: 'GPT-6 Astra (Très rapide et polyvalent)' },
    { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol (Performances maximales)' }
  ],
  gemini: [
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite (Le plus économique)' },
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash (Excellent ratio vitesse/prix)' },
  ]
}

interface AiSetupData {
  has_key: boolean
  provider?: AiProvider
  model?: string
  api_key_suffix?: string
}

interface State {
  busy: boolean
  error: string | null
  ok: string | null
}

// Petit état « envoi en cours / erreur / succès » partagé par les formulaires de la page.
function useSubmit() {
  const [state, setState] = useState<State>({
    busy: false,
    error: null,
    ok: null,
  })
  const run = async (fn: () => Promise<string | void>) => {
    setState({ busy: true, error: null, ok: null })
    try {
      const ok = await fn()
      setState({ busy: false, error: null, ok: ok ?? null })
    } catch (err) {
      setState({
        busy: false,
        error: err instanceof Error ? err.message : 'Erreur inconnue',
        ok: null,
      })
    }
  }
  return [state, run] as const
}

function Feedback({ state }: { state: State }) {
  if (state.error)
    return (
      <p role="alert" className="text-xs text-red-600 dark:text-red-400">
        {state.error}
      </p>
    )
  if (state.ok)
    return (
      <p className="text-xs text-emerald-600 dark:text-emerald-400">
        {state.ok}
      </p>
    )
  return null
}

function Section({
  title,
  description,
  danger,
  children,
}: {
  title: string
  description?: string
  danger?: boolean
  children: ReactNode
}) {
  return (
    <section
      className={`rounded-xl border bg-white p-5 shadow-sm dark:bg-zinc-900/60 ${danger ? 'border-red-200 dark:border-red-900/60' : 'border-zinc-200 dark:border-zinc-800'}`}
    >
      <h2
        className={`text-sm font-semibold ${danger ? 'text-red-700 dark:text-red-400' : ''}`}
      >
        {title}
      </h2>
      {description && (
        <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
      )}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  )
}

export default function ProfilePage() {
  const { user, setUser, endSession } = useAuth()
  const [name, setName] = useState(user?.display_name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [emailPassword, setEmailPassword] = useState('')
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [delPw, setDelPw] = useState('')
  const [profile, runProfile] = useSubmit()
  const [pw, runPw] = useSubmit()
  const [all, runAll] = useSubmit()
  const [del, runDel] = useSubmit()
  const [aiSetup, setAiSetup] = useState<AiSetupData | null>(null)
  const [provider, setProvider] = useState<AiProvider>('openai')
  const [model, setModel] = useState(AI_MODELS['openai'][0]!.id)
  const [apiKey, setApiKey] = useState('')
  const [aiSubmit, runAiSubmit] = useSubmit()

  useEffect(() => {
    api<AiSetupData>('/ai/settings').then(setAiSetup)
  }, [])

  const saveAiKey = (e: FormEvent) => {
    e.preventDefault()
    void runAiSubmit(async () => {
      const res = await api<AiSetupData>('/ai/settings', {
        method: 'POST',
        body: JSON.stringify({ provider, model: model.trim(), api_key: apiKey.trim() })
      })
      setAiSetup(res)
      setApiKey('')
      return 'Paramètres IA configurés avec succès.'
    })
  }

  const deleteAiKey = () => {
    if (!window.confirm('Supprimer votre clé API ?')) return
    void runAiSubmit(async () => {
      await api('/ai/settings', { method: 'DELETE' })
      setAiSetup({ has_key: false })
    })
  }

  if (!user) return null
  const emailChanged = email.trim().toLowerCase() !== user.email

  const saveProfile = (e: FormEvent) => {
    e.preventDefault()
    void runProfile(async () => {
      const updated = await api<AuthUser>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          display_name: name.trim(),
          ...(emailChanged
            ? { email: email.trim(), current_password: emailPassword }
            : {}),
        }),
      })
      setUser(updated)
      setEmailPassword('')
      return 'Profil enregistré.'
    })
  }

  const changePassword = (e: FormEvent) => {
    e.preventDefault()
    void runPw(async () => {
      await api('/auth/password', {
        method: 'POST',
        body: JSON.stringify({ current_password: curPw, new_password: newPw }),
      })
      setCurPw('')
      setNewPw('')
      return 'Mot de passe modifié. Les autres appareils ont été déconnectés.'
    })
  }

  const logoutAll = () => {
    if (
      !window.confirm(
        'Se déconnecter de tous les appareils, y compris celui-ci ?',
      )
    )
      return
    void runAll(async () => {
      await api('/auth/logout-all', { method: 'POST' })
      endSession()
    })
  }

  const deleteAccount = (e: FormEvent) => {
    e.preventDefault()
    if (
      !window.confirm(
        'Supprimer définitivement votre compte et toutes vos données (cours, évaluations, calendrier) ? Cette action est irréversible.',
      )
    )
      return
    void runDel(async () => {
      await api('/auth/me', {
        method: 'DELETE',
        body: JSON.stringify({ password: delPw }),
      })
      endSession()
    })
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Profil</h1>

      <Section title="Informations">
        <form onSubmit={saveProfile} className="space-y-3">
          <div>
            <label htmlFor="p-name" className={label}>
              Nom affiché
            </label>
            <input
              id="p-name"
              className={field}
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="p-email" className={label}>
              Email
            </label>
            <input
              id="p-email"
              type="email"
              required
              className={field}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          {emailChanged && (
            <div>
              <label htmlFor="p-email-pw" className={label}>
                Mot de passe actuel (requis pour changer d'email)
              </label>
              <input
                id="p-email-pw"
                type="password"
                required
                className={field}
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          )}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={profile.busy} className={primary}>
              Enregistrer
            </button>
            <Feedback state={profile} />
          </div>
        </form>
      </Section>

      <Section
        title="Mot de passe"
        description="Changer le mot de passe déconnecte vos autres appareils."
      >
        <form onSubmit={changePassword} className="space-y-3">
          <div>
            <label htmlFor="p-cur" className={label}>
              Mot de passe actuel
            </label>
            <input
              id="p-cur"
              type="password"
              required
              className={field}
              value={curPw}
              onChange={(e) => setCurPw(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div>
            <label htmlFor="p-new" className={label}>
              Nouveau mot de passe (10 caractères minimum)
            </label>
            <input
              id="p-new"
              type="password"
              required
              minLength={10}
              className={field}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pw.busy} className={primary}>
              Changer le mot de passe
            </button>
            <Feedback state={pw} />
          </div>
        </form>
      </Section>

      <Section
        title="Sessions"
        description="Fermez toutes les sessions ouvertes, par exemple après avoir utilisé un appareil partagé."
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={logoutAll}
            disabled={all.busy}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Se déconnecter partout
          </button>
          <Feedback state={all} />
        </div>
      </Section>

      <Section title="Intelligence artificielle" description="Configurez votre propre clé API pour générer des évaluations basées sur vos cours.">
        {aiSetup?.has_key ? (
          <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <div>
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-400">Clé API active</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-500">
                Fournisseur : <span className="capitalize">{aiSetup.provider}</span> • Modèle : {aiSetup.model}
              </p>
              <p className="mt-0.5 text-xs text-emerald-600/70 dark:text-emerald-500/70">
                Terminant par ...{aiSetup.api_key_suffix}
              </p>
            </div>
            <button type="button" onClick={deleteAiKey} className="text-sm font-medium text-red-600 hover:underline">Supprimer</button>
          </div>
        ) : (
          <form onSubmit={saveAiKey} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="p-provider" className={label}>Fournisseur IA</label>
                <select
                  id="p-provider"
                  className={field}
                  value={provider}
                  onChange={(e) => {
                    const p = e.target.value as AiProvider;
                    setProvider(p);
                    // On bascule automatiquement sur le premier modèle du nouveau fournisseur
                    setModel(AI_MODELS[p][0]!.id);
                  }}
                >
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </div>

              <div>
                <label htmlFor="p-model" className={label}>Modèle</label>
                <select
                  id="p-model"
                  className={field}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  required
                >
                  {AI_MODELS[provider].map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="p-apikey" className={label}>Clé API</label>
              <input
                id="p-apikey"
                type="password"
                required
                className={field}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-proj-..."
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button type="submit" disabled={aiSubmit.busy} className={primary}>Enregistrer</button>
              <Feedback state={aiSubmit} />
            </div>
          </form>
        )}
      </Section>

      <Section
        title="Images des notes"
        description="Fichiers privés conservés dans votre compte."
      >
        <NoteImagesPanel />
      </Section>

      <Section
        title="Exporter mes données"
        description="Sélection de cours ou copie complète de votre compte."
      >
        <ExportPanel />
      </Section>

      <Section
        title="Supprimer le compte"
        description="Supprime définitivement votre compte et toutes vos données."
        danger
      >
        <form onSubmit={deleteAccount} className="space-y-3">
          <div>
            <label htmlFor="p-del" className={label}>
              Mot de passe
            </label>
            <input
              id="p-del"
              type="password"
              required
              className={field}
              value={delPw}
              onChange={(e) => setDelPw(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={del.busy}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
            >
              Supprimer mon compte
            </button>
            <Feedback state={del} />
          </div>
        </form>
      </Section>
    </div>
  )
}
