import { useMemo } from "react";
import type { CalendarEvent } from "../api/types";
import { addDays, formatTime, isSameDay } from "../lib/dates";

const HOUR_H = 48; // hauteur d'une heure, en px
const FALLBACK_COLOR = "#71717a";

const isMidnight = (d: Date) => d.getHours() === 0 && d.getMinutes() === 0;
/** Journée entière : de minuit à minuit (convention des fichiers .ics). */
const isAllDay = (ev: CalendarEvent) => {
  const s = new Date(ev.starts_at);
  const e = new Date(ev.ends_at);
  return isMidnight(s) && isMidnight(e) && e > s;
};

interface Seg { ev: CalendarEvent; startMin: number; endMin: number; lane: number; lanes: number }

// Découpe les événements d'un jour en segments positionnés ; les chevauchements se partagent la largeur.
function layoutDay(events: CalendarEvent[], dayStart: Date): Seg[] {
  const dayEnd = addDays(dayStart, 1);
  const segs: Seg[] = events.filter((e) => !isAllDay(e)).flatMap((ev) => {
    const s = new Date(ev.starts_at);
    const e = new Date(ev.ends_at);
    if (!(s < dayEnd && (e > dayStart || (e.getTime() === s.getTime() && s >= dayStart)))) return [];
    const startMin = (Math.max(s.getTime(), dayStart.getTime()) - dayStart.getTime()) / 60_000;
    const endMin = Math.max((Math.min(e.getTime(), dayEnd.getTime()) - dayStart.getTime()) / 60_000, startMin + 30);
    return [{ ev, startMin, endMin, lane: 0, lanes: 1 }];
  }).sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  // Groupes d'événements qui se chevauchent : chacun occupe la première "voie" libre.
  let cluster: Seg[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const close = () => { cluster.forEach((s) => { s.lanes = laneEnds.length; }); cluster = []; laneEnds = []; };
  for (const seg of segs) {
    if (seg.startMin >= clusterEnd) { close(); clusterEnd = -1; }
    let lane = laneEnds.findIndex((end) => end <= seg.startMin);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(seg.endMin); } else laneEnds[lane] = seg.endMin;
    seg.lane = lane;
    cluster.push(seg);
    clusterEnd = Math.max(clusterEnd, seg.endMin);
  }
  close();
  return segs;
}

interface Props { weekStart: Date; events: CalendarEvent[]; onSelect: (ev: CalendarEvent) => void }

export default function WeekGrid({ weekStart, events, onSelect }: Props) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const perDay = useMemo(() => days.map((d) => layoutDay(events, d)), [days, events]);

  // Plage horaire : 8 h – 19 h par défaut, élargie si des événements sortent de cette plage.
  const all = perDay.flat();
  const first = all.length ? Math.min(8, Math.floor(Math.min(...all.map((s) => s.startMin)) / 60)) : 8;
  const last = all.length ? Math.max(19, Math.ceil(Math.max(...all.map((s) => s.endMin)) / 60)) : 19;
  const hours = Array.from({ length: last - first }, (_, i) => first + i);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const cols = "grid grid-cols-[3rem_repeat(7,minmax(0,1fr))]";
  const allDay = days.map((d) => events.filter((e) => {
    const s = new Date(e.starts_at);
    return isAllDay(e) && s < addDays(d, 1) && new Date(e.ends_at) > d;
  }));

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div className="min-w-[640px] md:min-w-[780px]">
        <div className={`${cols} border-b border-zinc-200 dark:border-zinc-800`}>
          <div />
          {days.map((d) => {
            const today = isSameDay(d, now);
            return (
              <div key={d.toISOString()} className="border-l border-zinc-100 py-2 text-center dark:border-zinc-800/70">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">{d.toLocaleDateString("fr-FR", { weekday: "short" })}</div>
                <div className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm ${today ? "bg-indigo-600 font-medium text-white" : ""}`}>{d.getDate()}</div>
              </div>
            );
          })}
        </div>

        {allDay.some((l) => l.length > 0) && (
          <div className={`${cols} border-b border-zinc-200 dark:border-zinc-800`}>
            <div className="px-1 py-1.5 text-right text-[10px] text-zinc-400">Journée</div>
            {allDay.map((list, i) => (
              <div key={i} className="space-y-0.5 border-l border-zinc-100 p-1 dark:border-zinc-800/70">
                {list.map((ev) => (
                  <button key={ev.id} onClick={() => onSelect(ev)} className="block w-full truncate rounded px-1.5 py-0.5 text-left text-xs"
                    style={{ background: `${ev.subject_color ?? FALLBACK_COLOR}26`, color: ev.subject_color ?? FALLBACK_COLOR }}>
                    {ev.title}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className={cols}>
          <div>
            {hours.map((h) => (
              <div key={h} style={{ height: HOUR_H }} className="pr-2 pt-0.5 text-right text-[10px] text-zinc-400">{String(h).padStart(2, "0")}:00</div>
            ))}
          </div>
          {days.map((d, i) => (
            <div key={d.toISOString()} className="relative border-l border-zinc-100 dark:border-zinc-800/70">
              {hours.map((h) => <div key={h} style={{ height: HOUR_H }} className="border-b border-zinc-100 dark:border-zinc-800/70" />)}

              {perDay[i]!.map(({ ev, startMin, endMin, lane, lanes }) => {
                const color = ev.subject_color ?? FALLBACK_COLOR;
                return (
                  <button
                    key={`${ev.id}-${i}`} onClick={() => onSelect(ev)} title={ev.title}
                    className="absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left text-xs leading-tight hover:brightness-95"
                    style={{
                      top: ((startMin - first * 60) / 60) * HOUR_H,
                      height: ((endMin - startMin) / 60) * HOUR_H - 2,
                      left: `calc(${(lane / lanes) * 100}% + 1px)`,
                      width: `calc(${100 / lanes}% - 3px)`,
                      borderLeftColor: color, background: `${color}26`,
                    }}
                  >
                    <span className="block truncate font-medium">{ev.title}</span>
                    <span className="block truncate text-[11px] text-zinc-500">{formatTime(new Date(ev.starts_at))}{ev.location ? ` · ${ev.location}` : ""}</span>
                  </button>
                );
              })}

              {isSameDay(d, now) && nowMin >= first * 60 && nowMin <= last * 60 && (
                <div className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-red-500" style={{ top: ((nowMin - first * 60) / 60) * HOUR_H }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
