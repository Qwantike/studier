import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-24 text-center">
      <p className="text-5xl font-semibold tracking-tight text-zinc-300 dark:text-zinc-700">404</p>
      <h1 className="mt-4 text-lg font-semibold">Page introuvable</h1>
      <Link to="/" className="mt-6 inline-block text-sm text-indigo-600 dark:text-indigo-400 underline dark:text-indigo-400">Retour au tableau de bord</Link>
    </main>
  );
}
