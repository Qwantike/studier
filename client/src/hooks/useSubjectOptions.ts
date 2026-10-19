import { useMemo } from "react";
import { useTree } from "./useTree";

// Matières à plat, avec leur chemin « année · semestre », pour les listes déroulantes.
export function useSubjectOptions() {
  const { data } = useTree();
  return useMemo(
    () => (data ?? []).flatMap((y) => y.semesters.flatMap((s) =>
      s.subjects.map((su) => ({ id: su.id, name: su.name, color: su.color, path: `${y.label} · ${s.label}` })))),
    [data]);
}
