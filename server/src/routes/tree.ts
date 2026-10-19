import { Router } from "express";
import { pool } from "../db/pool.js";

export const treeRouter = Router();

interface Row { id: string; position: number }
interface YearRow extends Row { label: string }
interface SemesterRow extends Row { label: string; year_id: string }
interface SubjectRow extends Row { name: string; color: string; coefficient: number | null; teacher: string | null; semester_id: string }
interface ChapterRow extends Row { title: string; status: string; subject_id: string }

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    m.set(k, [...(m.get(k) ?? []), it]);
  }
  return m;
}

// Arborescence complète (sans le contenu des chapitres) en 4 requêtes.
treeRouter.get("/tree", async (_req, res, next) => {
  try {
    const order = "ORDER BY position, created_at";
    const [years, semesters, subjects, chapters] = await Promise.all([
      pool.query<YearRow>(`SELECT id, label, position FROM years ${order}`),
      pool.query<SemesterRow>(`SELECT id, label, position, year_id FROM semesters ${order}`),
      pool.query<SubjectRow>(`SELECT id, name, color, coefficient, teacher, position, semester_id FROM subjects ${order}`),
      pool.query<ChapterRow>(`SELECT id, title, status, position, subject_id FROM chapters ${order}`),
    ]);
    const semByYear = groupBy(semesters.rows, (s) => s.year_id);
    const subBySem = groupBy(subjects.rows, (s) => s.semester_id);
    const chapBySub = groupBy(chapters.rows, (c) => c.subject_id);

    res.json(years.rows.map((y) => ({
      ...y,
      semesters: (semByYear.get(y.id) ?? []).map((s) => ({
        ...s,
        subjects: (subBySem.get(s.id) ?? []).map((su) => ({ ...su, chapters: chapBySub.get(su.id) ?? [] })),
      })),
    })));
  } catch (err) { next(err); }
});
