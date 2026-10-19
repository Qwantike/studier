import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { STATUS_DOT, STATUS_LABELS, type CalendarEvent, type DashboardData } from "../api/types";
import { api } from "../api/client";
import ErrorMessage from "../components/ErrorMessage";
import EvaluationCard from "../components/EvaluationCard";
import { useDashboard } from "../hooks/useDashboard";
import { useTree } from "../hooks/useTree";
import { revealInTree } from "../lib/uiState";
import {
  addDays, currentAcademicYearLabel, formatAverage, formatTime, isAllDay, isSameDay, relativeTime, startOfWeek, toDateInput,
} from "../lib/dates";

function Card({ title, link, children }: { title: string; link?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-zinc-500">{title}</h2>
        {link && <Link to={link.to} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">{link.label}</Link>}
      </div>
      {children}
    </section>
  );
}
const Empty = ({ children }: { children: ReactNode }) => <p className="py-4 text-center text-sm text-zinc-400">{children}</p>;

// Événements de la semaine regroupés par jour (un événement commencé avant la semaine apparaît le lundi).
function WeekCard({ events }: { events: CalendarEvent[] }) {
  const monday = startOfWeek(new Date());
  const byDay = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const start = new Date(ev.starts_at);
    const key = toDateInput(start < monday ? monday : start);
    byDay.set(key, [...(byDay.get(key) ?? []), ev]);
  }
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter((d) => byDay.has(toDateInput(d)));

  return (
    <Card title="Cette semaine" link={{ to: "/emploi-du-temps", label: "Emploi du temps" }}>
      {days.length === 0 ? <Empty>Rien de prévu cette semaine.</Empty> : (
        <div className="space-y-4">
          {days.map((d) => {
            const today = isSameDay(d, new Date());
            return (
              <div key={d.toISOString()}>
                <p className={`mb-1.5 text-xs font-medium first-letter:uppercase ${today ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400"}`}>
                  {today ? "Aujourd'hui" : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" })}
                </p>
                <ul className="space-y-1.5">
                  {byDay.get(toDateInput(d))!.map((ev) => (
                    <li key={ev.id} className="flex items-center gap-3 text-sm">
                      <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: ev.subject_color ?? "#a1a1aa" }} />
                      <span className="w-24 shrink-0 text-xs tabular-nums text-zinc-500">
                        {isAllDay(ev.starts_at, ev.ends_at) ? "Journée" : `${formatTime(new Date(ev.starts_at))}–${formatTime(new Date(ev.ends_at))}`}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{ev.title}</span>
                      {ev.location && <span className="hidden shrink-0 truncate text-xs text-zinc-400 sm:block">{ev.location}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function GradesCard({ data, onYear }: { data: DashboardData["grades"]; onYear: (id: string) => void }) {
  const graded = data.subjects.some((s) => s.average !== null);
  return (
    <Card title="Moyennes">
      {data.years.length > 1 && (
        <select
          value={data.year_id ?? ""} onChange={(e) => onYear(e.target.value)} aria-label="Année"
          className="mb-4 rounded-lg border border-zinc-200 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
        >
          {data.years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
        </select>
      )}
      {!graded ? <Empty>Aucune note saisie. Ajoutez la note d'une évaluation pour voir vos moyennes.</Empty> : (
        <>
          <p className="flex items-baseline gap-1.5">
            <span className="text-4xl font-semibold tracking-tight">{formatAverage(data.general)}</span>
            <span className="text-sm text-zinc-400">/20 · moyenne générale</span>
          </p>
          <div className="mt-5 space-y-4">
            {data.semesters.map((sem) => (
              <div key={sem.id}>
                <p className="mb-1.5 flex justify-between text-xs font-medium text-zinc-400">
                  <span>{sem.label}</span><span>{formatAverage(sem.average)}</span>
                </p>
                <ul className="space-y-2">
                  {data.subjects.filter((s) => s.semester_id === sem.id).map((s) => (
                    <li key={s.id} className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                        <span className="min-w-0 flex-1 truncate">{s.name}</span>
                        <span className={`tabular-nums ${s.average === null ? "text-zinc-300" : "font-medium"}`}>{formatAverage(s.average)}</span>
                      </div>
                      {s.average !== null && (
                        <div className="ml-4 mt-1 h-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                          <div className="h-full rounded-full" style={{ width: `${(s.average / 20) * 100}%`, background: s.color }} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// Première utilisation : crée l'année en cours avec ses deux semestres en un clic.
function Onboarding() {
  const qc = useQueryClient();
  const label = currentAcademicYearLabel();
  const create = useMutation({
    mutationFn: async () => {
      const year = await api<{ id: string }>("/years", { method: "POST", body: JSON.stringify({ label }) });
      for (const sem of ["S1", "S2"]) {
        await api("/semesters", { method: "POST", body: JSON.stringify({ year_id: year.id, label: sem }) });
      }
      return year.id;
    },
    onSuccess: (yearId) => {
      void qc.invalidateQueries({ queryKey: ["tree"] });
      revealInTree([yearId]); // ouvre la barre latérale sur la nouvelle année
    },
  });
  return (
    <section className="mt-8 rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
      <h2 className="text-lg font-semibold tracking-tight">Bienvenue</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
        Organisez vos études en année, semestres, matières et chapitres, puis reliez vos évaluations aux chapitres à réviser.
      </p>
      <button onClick={() => create.mutate()} disabled={create.isPending} className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
        {create.isPending ? "Création…" : `Créer l'année ${label} (S1 et S2)`}
      </button>
      {create.isError && <div className="mx-auto mt-4 max-w-md text-left"><ErrorMessage message={create.error.message} /></div>}
    </section>
  );
}

export default function DashboardPage() {
  const [yearId, setYearId] = useState<string | undefined>();
  const { data, isLoading, error, refetch } = useDashboard(yearId);
  const { data: tree } = useTree();
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-14">
      <p className="text-sm text-zinc-400 first-letter:uppercase">{today}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Tableau de bord</h1>

      {isLoading && <p className="mt-8 text-sm text-zinc-500">Chargement…</p>}
      {error && <div className="mt-8"><ErrorMessage message={error.message} onRetry={() => void refetch()} /></div>}
      {tree && tree.length === 0 && <Onboarding />}
      {data && (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <WeekCard events={data.week.events} />

          <Card title="Prochaines évaluations" link={{ to: "/evaluations", label: "Tout voir" }}>
            {data.upcoming_evaluations.length === 0 ? <Empty>Aucune évaluation à venir.</Empty> : (
              <div className="space-y-2">{data.upcoming_evaluations.map((e) => <EvaluationCard key={e.id} ev={e} />)}</div>
            )}
          </Card>

          <Card title="Modifiés récemment">
            {data.recent_chapters.length === 0 ? <Empty>Aucun chapitre pour l'instant.</Empty> : (
              <ul className="-mx-2">
                {data.recent_chapters.map((c) => (
                  <li key={c.id}>
                    <Link to={`/chapitres/${c.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[c.status]}`} title={STATUS_LABELS[c.status]} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{c.title}</span>
                        <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.subject_color }} />{c.subject_name}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-zinc-400">{relativeTime(c.updated_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <GradesCard data={data.grades} onYear={setYearId} />
        </div>
      )}
    </main>
  );
}
