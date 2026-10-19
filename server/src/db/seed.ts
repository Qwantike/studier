import { pool } from "./pool.js";

type Status = "not_started" | "seen" | "understood" | "revised";
interface DemoSubject { name: string; color: string; coefficient: number; teacher: string; chapters: [string, Status, string][] }

const DEMO: { label: string; subjects: DemoSubject[] }[] = [
  { label: "S1", subjects: [
    { name: "Algorithmique avancée", color: "#6366f1", coefficient: 4, teacher: "Mme Laurent", chapters: [
      ["Complexité et notation O", "revised", "# Complexité\n\nUn algorithme de tri efficace est en $O(n \\log n)$.\n\n```python\ndef f(n):\n    return n * 2\n```\n"],
      ["Programmation dynamique", "understood", "# Programmation dynamique\n\nDécomposer en sous-problèmes qui se chevauchent.\n"],
      ["Graphes et plus courts chemins", "seen", "# Graphes\n\nDijkstra, Bellman-Ford.\n"],
    ] },
    { name: "Bases de données", color: "#10b981", coefficient: 3, teacher: "M. Dupont", chapters: [
      ["Modèle relationnel", "revised", "# Modèle relationnel\n"],
      ["SQL avancé", "seen", "# SQL avancé\n\nJointures, CTE, fonctions de fenêtrage.\n"],
      ["Transactions et index", "not_started", ""],
    ] },
  ] },
  { label: "S2", subjects: [
    { name: "Machine Learning", color: "#f59e0b", coefficient: 5, teacher: "Mme Petit", chapters: [
      ["Régression linéaire", "understood", "# Régression linéaire\n\n$\\hat{y} = X\\beta$\n"],
      ["Arbres de décision", "not_started", ""],
    ] },
  ] },
];

async function seed(): Promise<void> {
  const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM years");
  if ((rows[0]?.n ?? 0) > 0) {
    console.log("La base contient déjà des données : seed ignoré.");
    console.log("Pour repartir de zéro : psql \"$DATABASE_URL\" -c \"TRUNCATE years CASCADE\"");
    return;
  }
  const insert = async (sql: string, params: unknown[]): Promise<string> =>
    (await pool.query<{ id: string }>(sql, params)).rows[0]!.id;

  const subjectIds: Record<string, string> = {};
  const chapterIds: Record<string, string[]> = {};
  const yearId = await insert("INSERT INTO years (label, position) VALUES ('2025-2026', 0) RETURNING id", []);
  for (const [si, sem] of DEMO.entries()) {
    const semId = await insert("INSERT INTO semesters (year_id, label, position) VALUES ($1, $2, $3) RETURNING id", [yearId, sem.label, si]);
    for (const [ui, sub] of sem.subjects.entries()) {
      const subId = await insert(
        `INSERT INTO subjects (semester_id, name, color, coefficient, teacher, position)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [semId, sub.name, sub.color, sub.coefficient, sub.teacher, ui]);
      subjectIds[sub.name] = subId;
      chapterIds[sub.name] = [];
      for (const [ci, [title, status, md]] of sub.chapters.entries()) {
        const chId = await insert(
          "INSERT INTO chapters (subject_id, title, status, content_md, position) VALUES ($1, $2, $3, $4, $5) RETURNING id",
          [subId, title, status, md, ci]);
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
      `INSERT INTO evaluations (subject_id, title, type, date, coefficient)
       VALUES ($1, $2, $3, CURRENT_DATE + $4::int, $5) RETURNING id`,
      [subjectIds[ev.subject]!, ev.title, ev.type, ev.days, ev.coef]);
    await pool.query(
      "INSERT INTO evaluation_chapters (evaluation_id, chapter_id) SELECT $1::uuid, unnest($2::uuid[])",
      [evId, chapterIds[ev.subject]!.slice(0, ev.chapters)]);
  }
  console.log("Données de démonstration ajoutées.");
}

seed().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
