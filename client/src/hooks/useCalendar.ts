import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NETWORK_ERROR, api } from "../api/client";
import type { CalendarEvent, ImportResult } from "../api/types";
import { addDays } from "../lib/dates";

export function useWeekEvents(weekStart: Date) {
  const from = weekStart.toISOString();
  const to = addDays(weekStart, 7).toISOString();
  return useQuery({
    queryKey: ["calendar", from],
    queryFn: () => api<CalendarEvent[]>(`/calendar-events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  });
}

export interface EventInput {
  title: string; starts_at: string; ends_at: string; location: string | null; subject_id: string | null;
}

export function useCalendarMutations() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["calendar"] });
  return {
    create: useMutation({
      mutationFn: (body: EventInput) => api<CalendarEvent>("/calendar-events", { method: "POST", body: JSON.stringify(body) }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: (v: { id: string; body: Partial<EventInput> }) =>
        api<CalendarEvent>(`/calendar-events/${v.id}`, { method: "PATCH", body: JSON.stringify(v.body) }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<void>(`/calendar-events/${id}`, { method: "DELETE" }),
      onSuccess: refresh,
    }),
    clearImported: useMutation({
      mutationFn: () => api<{ deleted: number }>("/calendar/imported", { method: "DELETE" }),
      onSuccess: refresh,
    }),
    // Envoi multipart : pas d'en-tête Content-Type manuel (le navigateur ajoute la frontière).
    importIcs: useMutation({
      mutationFn: async (file: File) => {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/calendar/import", { method: "POST", body: form }).catch(() => { throw new Error(NETWORK_ERROR); });
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) throw new Error((body as { error?: { message?: string } } | null)?.error?.message ?? `Erreur ${res.status}`);
        return body as ImportResult;
      },
      onSuccess: refresh,
    }),
  };
}
