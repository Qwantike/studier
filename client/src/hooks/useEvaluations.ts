import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { ChapterStatus, EvaluationDetail, EvaluationListItem } from "../api/types";

export function useEvaluations(params: { subject_id?: string; chapter_id?: string } = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return useQuery({
    queryKey: ["evaluations", params],
    queryFn: () => api<EvaluationListItem[]>(`/evaluations${qs ? `?${qs}` : ""}`),
  });
}

export function useEvaluation(id: string | undefined) {
  return useQuery({
    queryKey: ["evaluation", id],
    queryFn: () => api<EvaluationDetail>(`/evaluations/${id}`),
    enabled: !!id,
  });
}

export interface EvaluationInput {
  subject_id: string; title: string; type: string; date: string;
  coefficient: number | null; grade: number | null; chapter_ids: string[];
}

export function useEvaluationMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["evaluations"] });
    void qc.invalidateQueries({ queryKey: ["evaluation"] });
  };
  return {
    create: useMutation({
      mutationFn: (body: EvaluationInput) => api<EvaluationDetail>("/evaluations", { method: "POST", body: JSON.stringify(body) }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: (v: { id: string; body: Partial<EvaluationInput> }) =>
        api<EvaluationDetail>(`/evaluations/${v.id}`, { method: "PATCH", body: JSON.stringify(v.body) }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<void>(`/evaluations/${id}`, { method: "DELETE" }),
      onSuccess: refresh,
    }),
  };
}

// Changement de statut d'un chapitre depuis la vue Préparation.
export function useSetChapterStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; status: ChapterStatus }) =>
      api<unknown>(`/chapters/${v.id}`, { method: "PATCH", body: JSON.stringify({ status: v.status }) }),
    onSuccess: () => {
      for (const key of ["evaluations", "evaluation", "tree", "chapter"]) void qc.invalidateQueries({ queryKey: [key] });
    },
  });
}
