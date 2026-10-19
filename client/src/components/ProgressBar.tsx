export default function ProgressBar({ value, total, className = "" }: { value: number; total: number; className?: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      className={`h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800 ${className}`}
      role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
    >
      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
