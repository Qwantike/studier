import { pool } from "./pool.js";
import { LEGACY_USER_ID } from "../services/auth.js";

type Status = "not_started" | "seen" | "understood" | "revised";
interface DemoSubject { name: string; color: string; coefficient: number; teacher: string; chapters: [string, Status, string][] }

const DEMO: { label: string; subjects: DemoSubject[] }[] = [
  {
    label: "S1", subjects: [
      {
        name: "Algorithmique avancée", color: "#6366f1", coefficient: 4, teacher: "Mme Laurent", chapters: [
          ["Complexité et notation O", "revised", "# Complexité\n\nUn algorithme de tri efficace est en $O(n \\log n)$.\n\n```python\ndef f(n):\n    return n * 2\n```\n"],
          ["Programmation dynamique", "understood", "# Programmation dynamique\n\nDécomposer en sous-problèmes qui se chevauchent.\n"],
          ["Graphes et plus courts chemins", "seen", "# Graphes\n\nDijkstra, Bellman-Ford.\n"],
        ]
      },
      {
        name: "Bases de données", color: "#10b981", coefficient: 3, teacher: "M. Dupont", chapters: [
          ["Modèle relationnel", "revised", "# Modèle relationnel\n"],
          ["SQL avancé", "seen", "# SQL avancé\n\nJointures, CTE, fonctions de fenêtrage.\n"],
          ["Transactions et index", "not_started", ""],
        ]
      },
    ]
  },
  {
    label: "S2", subjects: [
      {
        name: "Machine Learning", color: "#f59e0b", coefficient: 5, teacher: "Mme Petit", chapters: [
          ["Régression linéaire", "understood", "# Régression linéaire\n\n$\\hat{y} = X\\beta$\n"],
          ["Arbres de décision", "not_started", ""],
        ]
      },
    ]
  },
];

// Usage : npm run seed [-- email@exemple.fr]  (sans email : compte hérité 00000000-…-0001)
async function seed(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  let userId = LEGACY_USER_ID;
  if (email) {
    const u = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
    if (!u.rows[0]) { console.error(`Aucun compte avec l'email ${email}.`); process.exitCode = 1; return; }
    userId = u.rows[0].id;
  }
  const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM years WHERE user_id = $1", [userId]);
  if ((rows[0]?.n ?? 0) > 0) {
    console.log("Ce compte contient déjà des données : seed ignoré.");
    return;
  }
  const insert = async (sql: string, params: unknown[]): Promise<string> =>
    (await pool.query<{ id: string }>(sql, params)).rows[0]!.id;

  const subjectIds: Record<string, string> = {};
  const chapterIds: Record<string, string[]> = {};
  const yearId = await insert("INSERT INTO years (user_id, label, position) VALUES ($1, '2025-2026', 0) RETURNING id", [userId]);
  for (const [si, sem] of DEMO.entries()) {
    const semId = await insert(
      "INSERT INTO semesters (user_id, year_id, label, position) VALUES ($1, $2, $3, $4) RETURNING id",
      [userId, yearId, sem.label, si]);
    for (const [ui, sub] of sem.subjects.entries()) {
      const subId = await insert(
        `INSERT INTO subjects (user_id, semester_id, name, color, coefficient, teacher, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [userId, semId, sub.name, sub.color, sub.coefficient, sub.teacher, ui]);
      subjectIds[sub.name] = subId;
      chapterIds[sub.name] = [];
      for (const [ci, [title, status, md]] of sub.chapters.entries()) {
        const chId = await insert(
          "INSERT INTO chapters (user_id, subject_id, title, status, content_md, position) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
          [userId, subId, title, status, md, ci]);
        chapterIds[sub.name]!.push(chId);
      }
    }
  }
  // Deux évaluations à venir (dates relatives à aujourd'hui), liées à des chapitres.
  const evals = [
    { subject: "Algorithmique avancée", title: "Contrôle 1 : complexité et programmation dynamique", type: "controle", days: 9, coef: 2, chapters: 2 },
    { subject: "Bases de données", title: "Partiel de bases de données", type: "examen", days: 21, coef: 3, chapters: 3 },
  ];
  for (const ev of evals) {
    const evId = await insert(
      `INSERT INTO evaluations (user_id, subject_id, title, type, date, coefficient)
       VALUES ($1, $2, $3, $4, CURRENT_DATE + $5::int, $6) RETURNING id`,
      [userId, subjectIds[ev.subject]!, ev.title, ev.type, ev.days, ev.coef]);
    await pool.query(
      "INSERT INTO evaluation_chapters (evaluation_id, chapter_id, user_id) SELECT $1::uuid, unnest($2::uuid[]), $3::uuid",
      [evId, chapterIds[ev.subject]!.slice(0, ev.chapters), userId]);
  }
  console.log("Données de démonstration ajoutées.");
}

seed().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());