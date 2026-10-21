import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, isNotFound } from "../api/client";
import type { Chapter } from "../api/types";
import ErrorMessage from "../components/ErrorMessage";
import ChapterEditor from "../components/ChapterEditor";
import ExportChapterButton from "../components/ExportChapterButton";
import { waitForSaves } from "../hooks/useChapterSaver";

export default function ChapterPage() {
  const { id } = useParams();
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["chapter", id],
    queryFn: async () => {
      await waitForSaves(id!); // évite de relire une version antérieure à la dernière sauvegarde
      return api<Chapter>(`/chapters/${id}`);
    },
    enabled: !!id,
    gcTime: 0, // pas de cache : l'éditeur démarre toujours depuis le contenu à jour
  });

  if (isLoading) return <p className="p-6 sm:p-10 text-sm text-zinc-500">Chargement…</p>;
  if (error && !isNotFound(error)) {
    return <main className="mx-auto max-w-xl p-6"><ErrorMessage message={error.message} onRetry={() => void refetch()} /></main>;
  }
  if (error || !data) {
    return (
      <p className="p-6 sm:p-10 text-sm text-zinc-500">
        Chapitre introuvable. <Link to="/" className="text-indigo-600 dark:text-indigo-400 underline">Retour à l'accueil</Link>
      </p>
    );
  }
  return (
    <>
      {/* Bouton fixé en haut à droite de la zone de contenu, au-dessus de l'éditeur. */}
      <div className="pointer-events-none sticky top-0 z-10 flex h-0 justify-end px-3 pt-3">
        <div className="pointer-events-auto"><ExportChapterButton chapterId={data.id} /></div>
      </div>
      <ChapterEditor key={data.id} chapter={data} />
    </>
  );
}