import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { CalendarSource, SyncResult } from "../api/types";

interface SourceWithResult { source: CalendarSource; result: SyncResult }
interface SyncAllItem { id: string; name: string; ok: boolean; result?: SyncResult; error?: string }

export function useCalendarSources() {
  return useQuery({ queryKey: ["calendar-sources"], queryFn: () => api<CalendarSource[]>("/calendar-sources") });
}

export function useCalendarSourceMutations() {
  const qc = useQueryClient();
  // Une synchronisation modifie l'agenda et le tableau de bord.
  const refresh = () => {
    for (const key of ["calendar-sources", "calendar", "dashboard"]) void qc.invalidateQueries({ queryKey: [key] });
  };
  return {
    add: useMutation({
      mutationFn: (body: { url: string; name?: string }) =>
        api<SourceWithResult>("/calendar-sources", { method: "POST", body: JSON.stringify(body) }),
      onSuccess: refresh,
    }),
    sync: useMutation({
      mutationFn: (id: string) => api<SourceWithResult>(`/calendar-sources/${id}/sync`, { method: "POST" }),
      onSettled: refresh, // même en cas d'échec : l'erreur mémorisée s'affiche
    }),
    syncAll: useMutation({
      mutationFn: () => api<SyncAllItem[]>("/calendar-sources/sync-all", { method: "POST" }),
      onSettled: refresh,
    }),
    rename: useMutation({
      mutationFn: (v: { id: string; name: string }) =>
        api<CalendarSource>(`/calendar-sources/${v.id}`, { method: "PATCH", body: JSON.stringify({ name: v.name }) }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (v: { id: string; deleteEvents: boolean }) =>
        api<void>(`/calendar-sources/${v.id}?delete_events=${v.deleteEvents}`, { method: "DELETE" }),
      onSuccess: refresh,
    }),
  };
}
