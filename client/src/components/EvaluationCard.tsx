import { Link } from "react-router-dom";
import { EVAL_TYPE_LABELS, type EvaluationListItem } from "../api/types";
import { countdownClass, countdownLabel, daysUntil, formatShortDate } from "../lib/dates";
import ProgressBar from "./ProgressBar";

export default function EvaluationCard({ ev }: { ev: EvaluationListItem }) {
  const days = daysUntil(ev.date);
  return (
    <Link
      to={`/evaluations/${ev.id}`}
      className="flex items-center gap-4 rounded-xl border border-zinc-200 p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
    >
      <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: ev.subject_color }} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{ev.title}</p>
        <p className="mt-0.5 truncate text-sm text-zinc-500">
          {ev.subject_name} · {EVAL_TYPE_LABELS[ev.type]} · {formatShortDate(ev.date)}
        </p>
        {ev.chapter_total > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <ProgressBar value={ev.chapter_revised} total={ev.chapter_total} className="w-32" />
            <span className="text-xs text-zinc-400">{ev.chapter_revised}/{ev.chapter_total} révisés</span>
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${countdownClass(days)}`}>{countdownLabel(days)}</span>
        {ev.grade !== null && <span className="text-sm font-medium">{ev.grade}/20</span>}
      </div>
    </Link>
  );
}
