import { STATUS_DOT, STATUS_LABELS, type ChapterStatus } from "../api/types";

const STATUSES: ChapterStatus[] = ["not_started", "seen", "understood", "revised"];

// Sélecteur de statut : pastilles avec libellé, ou compact (points seuls avec infobulle).
export default function StatusPills({ value, onChange, compact = false }: {
  value: ChapterStatus; onChange: (s: ChapterStatus) => void; compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Statut du chapitre">
      {STATUSES.map((s) => {
        const active = value === s;
        return compact ? (
          <button
            key={s} role="radio" aria-checked={active} aria-label={STATUS_LABELS[s]} title={STATUS_LABELS[s]}
            onClick={() => onChange(s)}
            className={`flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${
              active ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950" : "border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
          >
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} />
          </button>
        ) : (
          <button
            key={s} role="radio" aria-checked={active} onClick={() => onChange(s)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
              active
                ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[s]}`} /> {STATUS_LABELS[s]}
          </button>
        );
      })}
    </div>
  );
}
