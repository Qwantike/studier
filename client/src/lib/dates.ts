// Les dates d'évaluation sont des chaînes AAAA-MM-JJ, interprétées en heure locale (sans décalage de fuseau).
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

export function toDateInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Nombre de jours entre aujourd'hui et la date (négatif si passée). */
export function daysUntil(s: string): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((parseLocalDate(s).getTime() - today.getTime()) / 86_400_000);
}

export function countdownLabel(days: number): string {
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Demain";
  if (days > 1) return `Dans ${days} jours`;
  if (days === -1) return "Hier";
  return `Il y a ${-days} jours`;
}

export const formatDate = (s: string) =>
  parseLocalDate(s).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export const formatShortDate = (s: string) =>
  parseLocalDate(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

/** Classes Tailwind du badge de compte à rebours : plus la date approche, plus il ressort. */
export function countdownClass(days: number): string {
  if (days < 0) return "bg-zinc-100 text-zinc-500 dark:bg-zinc-800";
  if (days <= 3) return "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300";
  if (days <= 7) return "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  return "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Lundi (minuit, heure locale) de la semaine qui contient d. */
export function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n); // addition en jours calendaires : reste correct lors des changements d'heure
  return x;
}

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Instant ISO -> valeur d'un <input type="datetime-local"> (heure locale). */
export function toLocalInput(iso: string | Date): string {
  const d = new Date(iso);
  return `${toDateInput(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const formatTime = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export function weekLabel(start: Date): string {
  const end = addDays(start, 6);
  const a = start.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const b = end.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  return `${a} – ${b}`;
}

/** Libellé de l'année universitaire en cours : de septembre à août (ex. « 2026-2027 »). */
export function currentAcademicYearLabel(now = new Date()): string {
  const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

/** Journée entière : de minuit à minuit (convention des fichiers .ics). */
export function isAllDay(startIso: string, endIso: string): boolean {
  const s = new Date(startIso);
  const e = new Date(endIso);
  return s.getHours() === 0 && s.getMinutes() === 0 && e.getHours() === 0 && e.getMinutes() === 0 && e > s;
}

/** « il y a 2 heures », « hier », « à l'instant »… */
export function relativeTime(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (abs < 60) return "à l'instant";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 30 * 86_400) return rtf.format(Math.round(diff / 86_400), "day");
  return rtf.format(Math.round(diff / (30 * 86_400)), "month");
}

export const formatAverage = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
