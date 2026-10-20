import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { uid } from "../middleware/auth.js";
import { listEventsBetween } from "../services/calendarEvents.js";
import { computeGrades, type GradeRow } from "../services/grades.js";
import { ah, idSchema } from "./crud.js";
import { GROUP_SQL, LIST_SQL } from "./evaluations.js";

// Le client envoie ses bornes (semaine, jour) pour que "aujourd'hui" suive SON fuseau horaire.
const querySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  year_id: idSchema.optional(),
});

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function defaultWeek() {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const next = new Date(monday);
  next.setDate(next.getDate() + 7);
  return { from: monday.toISOString(), to: next.toISOString() };
}

export const dashboardRouter = Router();

dashboardRouter.get("/dashboard", ah(async (req, res) => {
  const userId = uid(req);
  const q = querySchema.parse(req.query);
  const week = q.from && q.to ? { from: q.from, to: q.to } : defaultWeek();
  const today = q.today ?? localDate(new Date());

  const [events, upcoming, recent, years] = await Promise.all([
    listEventsBetween(userId, week.from, week.to),
    pool.query(`${LIST_SQL} WHERE e.user_id = $1 AND e.date >= $2 ${GROUP_SQL} LIMIT 5`, [userId, today]),
    pool.query(
      `SELECT c.id, c.title, c.status, c.updated_at, c.subject_id, s.name AS subject_name, s.color AS subject_color
       FROM chapters c JOIN subjects s ON s.id = c.subject_id
       WHERE c.user_id = $1
       ORDER BY c.updated_at DESC LIMIT 6`, [userId]),
    pool.query<{ id: string; label: string }>(
      "SELECT id, label FROM years WHERE user_id = $1 ORDER BY position, created_at", [userId]),
  ]);

  // Moyennes : sur l'année demandée si elle est à l'utilisateur, sinon la plus récente.
  const yearId = years.rows.find((y) => y.id === q.year_id)?.id ?? years.rows[years.rows.length - 1]?.id ?? null;
  const gradeRows = yearId
    ? (await pool.query<GradeRow>(
      `SELECT s.id AS subject_id, s.name AS subject_name, s.color AS subject_color,
                s.coefficient AS subject_coefficient, sem.id AS semester_id, sem.label AS semester_label,
                e.grade, e.coefficient AS eval_coefficient
         FROM subjects s
         JOIN semesters sem ON sem.id = s.semester_id
         LEFT JOIN evaluations e ON e.subject_id = s.id AND e.grade IS NOT NULL
         WHERE sem.year_id = $1 AND s.user_id = $2
         ORDER BY sem.position, sem.created_at, s.position, s.created_at, e.date`, [yearId, userId])).rows
    : [];

  res.json({
    week: { ...week, events },
    upcoming_evaluations: upcoming.rows,
    recent_chapters: recent.rows,
    grades: { year_id: yearId, years: years.rows, ...computeGrades(gradeRows) },
  });
}));