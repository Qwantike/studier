import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import CalendarPage from "./pages/CalendarPage";
import NotFoundPage from "./pages/NotFoundPage";
import EvaluationPage from "./pages/EvaluationPage";
import EvaluationsPage from "./pages/EvaluationsPage";
import DashboardPage from "./pages/DashboardPage";

// L'éditeur (Milkdown, CodeMirror, KaTeX) est lourd : chargé seulement à l'ouverture d'un chapitre.
const ChapterPage = lazy(() => import("./pages/ChapterPage"));

export default function App() {
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
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
