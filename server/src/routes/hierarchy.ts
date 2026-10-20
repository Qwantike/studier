import { z } from "zod";
import { crudRouter } from "./crud.js";

const name = z.string().trim().min(1, "Le nom est requis").max(200);
const uuid = z.string().uuid();

export const CHAPTER_STATUSES = ["not_started", "seen", "understood", "revised"] as const;

export const yearsRouter = crudRouter({
  table: "years",
  create: z.object({ label: name }),
});

export const semestersRouter = crudRouter({
  table: "semesters",
  parentColumn: "year_id",
  parentTable: "years",
  create: z.object({ year_id: uuid, label: name }),
});

export const subjectsRouter = crudRouter({
  table: "subjects",
  parentColumn: "semester_id",
  parentTable: "semesters",
  create: z.object({
    semester_id: uuid,
    name,
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide (#rrggbb)").optional(),
    coefficient: z.number().nonnegative().nullable().optional(),
    teacher: z.string().trim().max(200).nullable().optional(),
  }),
});

export const chaptersRouter = crudRouter({
  table: "chapters",
  parentColumn: "subject_id",
  parentTable: "subjects",
  // Les listes n'incluent jamais le contenu Markdown (lourd) ; GET /:id le renvoie.
  columns: "id, subject_id, title, status, position, created_at, updated_at",
  create: z.object({
    subject_id: uuid,
    title: name,
    content_md: z.string().optional(),
    status: z.enum(CHAPTER_STATUSES).optional(),
  }),
});