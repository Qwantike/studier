import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { DashboardData } from "../api/types";
import { addDays, startOfWeek, toDateInput } from "../lib/dates";

// Le client fournit sa semaine et sa date : "aujourd'hui" suit le fuseau de l'utilisateur, pas celui du serveur.
export function useDashboard(yearId?: string) {
  const now = new Date();
  const week = startOfWeek(now);
  const params = new URLSearchParams({ from: week.toISOString(), to: addDays(week, 7).toISOString(), today: toDateInput(now) });
  if (yearId) params.set("year_id", yearId);
  return useQuery({
    queryKey: ["dashboard", params.toString()],
    queryFn: () => api<DashboardData>(`/dashboard?${params}`),
  });
}
