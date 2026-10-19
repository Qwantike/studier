export type ChapterStatus = "not_started" | "seen" | "understood" | "revised";

export const STATUS_LABELS: Record<ChapterStatus, string> = {
  not_started: "Non commencé", seen: "Vu", understood: "Compris", revised: "Révisé",
};
export const STATUS_DOT: Record<ChapterStatus, string> = {
  not_started: "bg-zinc-300 dark:bg-zinc-600", seen: "bg-sky-400", understood: "bg-amber-400", revised: "bg-emerald-500",
};

export interface TreeChapter { id: string; title: string; status: ChapterStatus; position: number; subject_id: string }
export interface TreeSubject { id: string; name: string; color: string; coefficient: number | null; teacher: string | null; position: number; chapters: TreeChapter[] }
export interface TreeSemester { id: string; label: string; position: number; subjects: TreeSubject[] }
export interface TreeYear { id: string; label: string; position: number; semesters: TreeSemester[] }

export interface Chapter extends TreeChapter { content_md: string; updated_at: string }

export type EvalType = "controle" | "projet" | "examen" | "autre";
export const EVAL_TYPE_LABELS: Record<EvalType, string> = {
  controle: "Contrôle", projet: "Projet", examen: "Examen", autre: "Autre",
};

export interface EvaluationListItem {
  id: string; subject_id: string; title: string; type: EvalType;
  /** Date au format AAAA-MM-JJ. */
  date: string;
  coefficient: number | null; grade: number | null;
  subject_name: string; subject_color: string;
  chapter_total: number; chapter_revised: number;
}
export interface EvaluationDetail extends EvaluationListItem { chapters: TreeChapter[] }

export interface CalendarEvent {
  id: string; title: string;
  /** Instants ISO (UTC) ; affichés en heure locale. */
  starts_at: string; ends_at: string;
  location: string | null;
  subject_id: string | null; subject_name: string | null; subject_color: string | null;
  /** Vrai si l'événement vient d'un fichier .ics. */
  imported: boolean;
  /** Nom de l'abonnement d'où vient l'événement, s'il y en a un. */
  source_name: string | null;
}
export interface ImportResult { created: number; updated: number; unchanged: number; focus_date: string | null }

export interface SyncResult extends ImportResult { removed: number }
export interface CalendarSource {
  id: string; name: string; url: string;
  last_synced_at: string | null; last_error: string | null; event_count: number;
}

export interface RecentChapter {
  id: string; title: string; status: ChapterStatus; updated_at: string;
  subject_id: string; subject_name: string; subject_color: string;
}
export interface SubjectAverage {
  id: string; name: string; color: string; coefficient: number | null;
  semester_id: string; semester_label: string; average: number | null; grades_count: number;
}
export interface DashboardData {
  week: { from: string; to: string; events: CalendarEvent[] };
  upcoming_evaluations: EvaluationListItem[];
  recent_chapters: RecentChapter[];
  grades: {
    year_id: string | null; years: { id: string; label: string }[];
    general: number | null;
    semesters: { id: string; label: string; average: number | null }[];
    subjects: SubjectAverage[];
  };
}
