import { Component, type ErrorInfo, type ReactNode } from "react";

// Filet de sécurité : une erreur de rendu affiche un message au lieu d'une page blanche.
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  override componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info.componentStack); }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Une erreur est survenue</h1>
        <p className="mt-2 text-sm text-zinc-500">Cette page n'a pas pu s'afficher. Vos données ne sont pas affectées.</p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-zinc-100 p-3 text-left text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">{this.state.error.message}</pre>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => window.location.reload()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Recharger</button>
          <a href="/" className="rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-700">Accueil</a>
        </div>
      </main>
    );
  }
}
