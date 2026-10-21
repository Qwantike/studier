import { Download } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client";
import type { Chapter } from "../api/types";
import { waitForSaves } from "../hooks/useChapterSaver";
import { downloadChapter } from "../lib/exportChapter";

// Exporte le chapitre en .md, réimportable par « Importer » dans la matière d'un autre compte.
// On relit le chapitre sur le serveur (après les sauvegardes en cours) : la page ne garde que la version ouverte au départ.
export default function ExportChapterButton({ chapterId }: { chapterId: string }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onClick = async () => {
        setBusy(true);
        setError(null);
        try {
            await waitForSaves(chapterId);
            downloadChapter(await api<Chapter>(`/chapters/${chapterId}`));
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex items-center gap-2">
            {error && <span role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</span>}
            <button
                onClick={() => void onClick()} disabled={busy}
                title="Exporter en Markdown (.md)" aria-label="Exporter le chapitre en Markdown"
                className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white/80 px-2.5 py-1.5 text-sm text-zinc-600 shadow-sm backdrop-blur hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-300 dark:hover:bg-zinc-800"
            ><Download size={15} /> Exporter</button>
        </div>
    );
}