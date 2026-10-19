import type { ChapterStatus, TreeYear } from "../api/types";
import type { Level } from "../hooks/useTree";

// Nœud générique de l'arbre, pour afficher les 4 niveaux avec un seul composant.
export interface Row {
  level: Level;
  id: string;
  name: string;
  children: Row[];
  color?: string;
  status?: ChapterStatus;
}

export interface LevelConfig {
  /** Champ portant le nom côté API. */
  field: "label" | "name" | "title";
  child?: Level;
  /** Clé étrangère à fournir à la création d'un enfant. */
  childParentKey?: string;
  newName: string;
}

export const LEVELS: Record<Level, LevelConfig> = {
  years: { field: "label", child: "semesters", childParentKey: "year_id", newName: "Nouvelle année" },
  semesters: { field: "label", child: "subjects", childParentKey: "semester_id", newName: "Nouveau semestre" },
  subjects: { field: "name", child: "chapters", childParentKey: "subject_id", newName: "Nouvelle matière" },
  chapters: { field: "title", newName: "Nouveau chapitre" },
};

export const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#0ea5e9", "#a855f7", "#ec4899", "#14b8a6"];

export function buildRows(tree: TreeYear[]): Row[] {
  return tree.map((y) => ({
    level: "years", id: y.id, name: y.label,
    children: y.semesters.map((s) => ({
      level: "semesters", id: s.id, name: s.label,
      children: s.subjects.map((su) => ({
        level: "subjects", id: su.id, name: su.name, color: su.color,
        children: su.chapters.map((c) => ({
          level: "chapters", id: c.id, name: c.title, status: c.status, children: [],
        })),
      })),
    })),
  }));
}

export const countDescendants = (r: Row): number =>
  r.children.reduce((n, c) => n + 1 + countDescendants(c), 0);

// Actions et état partagés par tous les nœuds.
export interface TreeCtx {
  expanded: Record<string, boolean>;
  toggle: (id: string, force?: boolean) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  menuId: string | null;
  setMenuId: (id: string | null) => void;
  addChild: (row: Row) => void;
  rename: (row: Row, name: string) => void;
  recolor: (row: Row, color: string) => void;
  remove: (row: Row) => void;
  move: (siblings: Row[], index: number, dir: -1 | 1) => void;
}
