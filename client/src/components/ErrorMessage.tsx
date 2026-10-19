import { TriangleAlert } from "lucide-react";

export default function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
      <p className="flex items-start gap-2"><TriangleAlert size={16} className="mt-0.5 shrink-0" /> {message}</p>
      {onRetry && <button onClick={onRetry} className="mt-3 font-medium underline">Réessayer</button>}
    </div>
  );
}
