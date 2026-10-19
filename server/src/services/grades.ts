// Calcul des moyennes pondérées (fonctions pures, sans accès à la base).

export interface GradeRow {
  subject_id: string; subject_name: string; subject_color: string; subject_coefficient: number | null;
  semester_id: string; semester_label: string;
  /** Une ligne par note ; null pour une matière sans note. */
  grade: number | null; eval_coefficient: number | null;
}
export interface SubjectAverage {
  id: string; name: string; color: string; coefficient: number | null;
  semester_id: string; semester_label: string; average: number | null; grades_count: number;
}
export interface SemesterAverage { id: string; label: string; average: number | null }
export interface GradesSummary { general: number | null; semesters: SemesterAverage[]; subjects: SubjectAverage[] }

const round2 = (n: number) => Math.round(n * 100) / 100;

// Un coefficient absent compte pour 1 ; un coefficient 0 ne pèse rien.
function weightedMean(items: { value: number; weight: number }[]): number | null {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) return null;
  return items.reduce((s, i) => s + i.value * i.weight, 0) / total;
}

export function computeGrades(rows: GradeRow[]): GradesSummary {
  // Regroupement par matière en conservant l'ordre des lignes (déjà trié par semestre puis matière).
  const subjects = new Map<string, { row: GradeRow; grades: { value: number; weight: number }[] }>();
  for (const r of rows) {
    const entry = subjects.get(r.subject_id) ?? { row: r, grades: [] };
    if (r.grade !== null) entry.grades.push({ value: r.grade, weight: r.eval_coefficient ?? 1 });
    subjects.set(r.subject_id, entry);
  }

  const raw = [...subjects.values()].map(({ row, grades }) => ({ row, avg: weightedMean(grades), count: grades.length }));
  // Moyenne d'un ensemble de matières : pondérée par leur coefficient, sur celles qui ont des notes.
  const mean = (list: typeof raw) =>
    weightedMean(list.filter((s) => s.avg !== null).map((s) => ({ value: s.avg!, weight: s.row.subject_coefficient ?? 1 })));

  const semesters = new Map<string, { label: string; list: typeof raw }>();
  for (const s of raw) {
    const e = semesters.get(s.row.semester_id) ?? { label: s.row.semester_label, list: [] };
    e.list.push(s);
    semesters.set(s.row.semester_id, e);
  }
  const rounded = (n: number | null) => (n === null ? null : round2(n));

  return {
    general: rounded(mean(raw)),
    semesters: [...semesters.entries()].map(([id, e]) => ({ id, label: e.label, average: rounded(mean(e.list)) })),
    subjects: raw.map((s) => ({
      id: s.row.subject_id, name: s.row.subject_name, color: s.row.subject_color,
      coefficient: s.row.subject_coefficient, semester_id: s.row.semester_id, semester_label: s.row.semester_label,
      average: rounded(s.avg), grades_count: s.count,
    })),
  };
}
