import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { useAuth } from "./hooks/useAuth";
import CalendarPage from "./pages/CalendarPage";
import NotFoundPage from "./pages/NotFoundPage";
import EvaluationPage from "./pages/EvaluationPage";
import EvaluationsPage from "./pages/EvaluationsPage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";

// L'éditeur (Milkdown, CodeMirror, KaTeX) est lourd : chargé seulement à l'ouverture d'un chapitre.
const ChapterPage = lazy(() => import("./pages/ChapterPage"));

export default function App() {
  const { status, retry } = useAuth();

  if (status === "loading") return <p className="p-10 text-sm text-zinc-500">Chargement…</p>;
  if (status === "error") {
    return (
      <div className="grid min-h-dvh place-items-center px-4 text-center">
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">Impossible de joindre le serveur.</p>
          <button onClick={retry} className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">Réessayer</button>
        </div>
      </div>
    );
  }
  // Non connecté : la page de connexion s'affiche à l'adresse demandée, qui reste ouverte après connexion.
  if (status === "anonymous") return <LoginPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="emploi-du-temps" element={<CalendarPage />} />
        <Route path="evaluations" element={<EvaluationsPage />} />
        <Route path="evaluations/:id" element={<EvaluationPage />} />
        <Route
          path="chapitres/:id"
          element={<Suspense fallback={<p className="p-10 text-sm text-zinc-500">Chargement…</p>}><ChapterPage /></Suspense>}
        />
        <Route path="profil" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}