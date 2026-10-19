import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { TreeYear } from "../api/types";

export type Level = "years" | "semesters" | "subjects" | "chapters";

export function useTree() {
  return useQuery({ queryKey: ["tree"], queryFn: () => api<TreeYear[]>("/tree") });
}

const json = (body: unknown) => JSON.stringify(body);

// Mutations de l'arborescence ; chacune rafraîchit l'arbre (et le chapitre ouvert).
export function useTreeActions(onError: (message: string) => void) {
  const qc = useQueryClient();
  const shared = {
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tree"] });
      void qc.invalidateQueries({ queryKey: ["chapter"] });
      // Renommer/supprimer/déplacer un chapitre ou une matière change aussi les évaluations.
      void qc.invalidateQueries({ queryKey: ["evaluations"] });
      void qc.invalidateQueries({ queryKey: ["evaluation"] });
    },
    onError: (e: Error) => onError(e.message),
  };
  return {
    create: useMutation({
      mutationFn: (v: { level: Level; body: Record<string, unknown> }) =>
        api<{ id: string }>(`/${v.level}`, { method: "POST", body: json(v.body) }),
      ...shared,
    }),
    update: useMutation({
      mutationFn: (v: { level: Level; id: string; body: Record<string, unknown> }) =>
        api<unknown>(`/${v.level}/${v.id}`, { method: "PATCH", body: json(v.body) }),
      ...shared,
    }),
    remove: useMutation({
      mutationFn: (v: { level: Level; id: string }) => api<void>(`/${v.level}/${v.id}`, { method: "DELETE" }),
      ...shared,
    }),
    reorder: useMutation({
      mutationFn: (v: { level: Level; ids: string[] }) =>
        api<void>(`/${v.level}/reorder`, { method: "POST", body: json({ ids: v.ids }) }),
      ...shared,
    }),
  };
}
