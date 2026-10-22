import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db/pool.js";
import { PASSWORD, buildGraph, expectStatus, newUser, snapshot, startIcsServer, type Graph, type IcsServer, type TestUser } from "./helpers.js";

// A possède des données ; B (un autre compte) tente de les lire, modifier, supprimer ou référencer.
let ics: IcsServer;
let A: TestUser, B: TestUser;
let a: Graph, b: Graph;
let before: Awaited<ReturnType<typeof snapshot>>;
let sharedUidOwners: string[] = [];
let sharedUrlCount = 0;

const sqlError = async (sql: string, params: unknown[] = []): Promise<string | undefined> => {
    try { await pool.query(sql, params); return undefined; } catch (err) { return (err as { code?: string }).code; }
};

beforeAll(async () => {
    ics = await startIcsServer();
    A = await newUser("alice");
    B = await newUser("bob");
    a = await buildGraph(A, ics.url, "SECRET-A");
    b = await buildGraph(B, ics.url, "BOB"); // même URL d'abonnement et mêmes ics_uid que A : doit être permis
    before = await snapshot(A, a);
    // Relevé juste après la création (plus tard, un test supprime les imports de B).
    const uid = await pool.query(
        "SELECT DISTINCT user_id FROM calendar_events WHERE ics_uid = 'shared-1' AND user_id = ANY($1::uuid[])", [[A.id, B.id]]);
    sharedUidOwners = uid.rows.map((r) => r.user_id as string).sort();
    sharedUrlCount = (await pool.query(
        "SELECT 1 FROM calendar_sources WHERE url = $1 AND user_id = ANY($2::uuid[])", [ics.url, [A.id, B.id]])).rowCount ?? 0;
});

afterAll(async () => {
    await ics.close();
    await pool.end();
});

describe("B ne voit rien de A", () => {
    it("les listes de B ne contiennent aucune donnée de A", async () => {
        for (const url of [
            "/api/years", "/api/semesters", "/api/subjects", "/api/chapters", "/api/evaluations", "/api/calendar-sources",
            "/api/tree", "/api/dashboard", "/api/calendar-events?from=2000-01-01T00:00:00Z&to=2100-01-01T00:00:00Z",
        ]) {
            const res = expectStatus(await B.agent.get(url), 200);
            expect(JSON.stringify(res.body), url).not.toContain("SECRET-A");
            expect(JSON.stringify(res.body), url).not.toContain(a.yearId);
        }
    });

    it("les filtres par parent d'un autre compte ne renvoient rien", async () => {
        for (const url of [
            `/api/semesters?year_id=${a.yearId}`, `/api/subjects?semester_id=${a.semesterId}`, `/api/chapters?subject_id=${a.subjectId}`,
            `/api/evaluations?subject_id=${a.subjectId}`, `/api/evaluations?chapter_id=${a.chapterId}`,
        ]) {
            const res = expectStatus(await B.agent.get(url), 200);
            expect(res.body, url).toEqual([]);
        }
    });

    it("le tableau de bord ignore l'année d'un autre compte", async () => {
        const res = expectStatus(await B.agent.get(`/api/dashboard?year_id=${a.yearId}`), 200);
        // Année demandée refusée : on retombe sur l'année la plus récente de B, jamais sur celle de A.
        expect(res.body.grades.year_id).not.toBe(a.yearId);
        expect([b.yearId, b.year2Id]).toContain(res.body.grades.year_id);
        expect(JSON.stringify(res.body)).not.toContain("SECRET-A");
    });
});

describe("B ne peut pas lire, modifier ou supprimer les éléments de A (404)", () => {
    const targets = [
        { name: "année", path: () => `/api/years/${a.yearId}`, patch: { label: "piraté" } },
        { name: "semestre", path: () => `/api/semesters/${a.semesterId}`, patch: { label: "piraté" } },
        { name: "matière", path: () => `/api/subjects/${a.subjectId}`, patch: { name: "piraté" } },
        { name: "chapitre", path: () => `/api/chapters/${a.chapterId}`, patch: { title: "piraté", content_md: "piraté" } },
        { name: "évaluation", path: () => `/api/evaluations/${a.evaluationId}`, patch: { title: "piraté", grade: 0 } },
        { name: "événement", path: () => `/api/calendar-events/${a.eventId}`, patch: { title: "piraté" }, noGet: true },
        { name: "abonnement", path: () => `/api/calendar-sources/${a.sourceId}`, patch: { name: "piraté" }, noGet: true },
    ];

    for (const t of targets) {
        it(`${t.name} : GET, PATCH, DELETE`, async () => {
            if (!t.noGet) expectStatus(await B.agent.get(t.path()), 404);
            expectStatus(await B.agent.patch(t.path()).send(t.patch), 404);
            expectStatus(await B.agent.delete(t.path()), 404);
        });
    }

    it("abonnement : synchronisation et suppression avec événements", async () => {
        expectStatus(await B.agent.post(`/api/calendar-sources/${a.sourceId}/sync`), 404);
        expectStatus(await B.agent.delete(`/api/calendar-sources/${a.sourceId}?delete_events=true`), 404);
    });

    it("le réordonnancement avec des identifiants de A n'a aucun effet", async () => {
        expectStatus(await B.agent.post("/api/years/reorder").send({ ids: [a.year2Id, a.yearId] }), 204);
        expectStatus(await B.agent.post("/api/chapters/reorder").send({ ids: [a.chapter2Id, a.chapterId] }), 204);
    });
});

describe("B ne peut pas rattacher ses données à celles de A (400)", () => {
    it("créer sous un parent de A", async () => {
        expectStatus(await B.agent.post("/api/semesters").send({ year_id: a.yearId, label: "x" }), 400);
        expectStatus(await B.agent.post("/api/subjects").send({ semester_id: a.semesterId, name: "x" }), 400);
        expectStatus(await B.agent.post("/api/chapters").send({ subject_id: a.subjectId, title: "x" }), 400);
        expectStatus(await B.agent.post("/api/evaluations").send({ subject_id: a.subjectId, title: "x", date: "2026-12-01" }), 400);
        expectStatus(await B.agent.post("/api/calendar-events").send({
            title: "x", starts_at: "2026-11-05T09:00:00Z", ends_at: "2026-11-05T10:00:00Z", subject_id: a.subjectId,
        }), 400);
    });

    it("déplacer un de ses éléments vers un parent de A", async () => {
        expectStatus(await B.agent.patch(`/api/semesters/${b.semesterId}`).send({ year_id: a.yearId }), 400);
        expectStatus(await B.agent.patch(`/api/subjects/${b.subjectId}`).send({ semester_id: a.semesterId }), 400);
        expectStatus(await B.agent.patch(`/api/chapters/${b.chapterId}`).send({ subject_id: a.subjectId }), 400);
        expectStatus(await B.agent.patch(`/api/evaluations/${b.evaluationId}`).send({ subject_id: a.subjectId }), 400);
        expectStatus(await B.agent.patch(`/api/calendar-events/${b.eventId}`).send({ subject_id: a.subjectId }), 400);
    });

    it("lier une de ses évaluations à un chapitre de A", async () => {
        expectStatus(await B.agent.patch(`/api/evaluations/${b.evaluationId}`).send({ chapter_ids: [a.chapterId] }), 400);
        expectStatus(await B.agent.post("/api/evaluations").send({
            subject_id: b.subjectId, title: "x", date: "2026-12-01", chapter_ids: [a.chapterId],
        }), 400);
    });

    it("« supprimer les imports » ne supprime que ceux de B", async () => {
        const res = expectStatus(await B.agent.delete("/api/calendar/imported"), 200);
        expect(res.body.deleted).toBe(3); // les 3 événements de l'abonnement de B, pas ceux de A
    });
});

describe("la base elle-même refuse les liens entre comptes (migration 004)", () => {
    it("enfant rattaché au parent d'un autre compte", async () => {
        expect(await sqlError("INSERT INTO semesters (user_id, year_id, label) VALUES ($1, $2, 'x')", [B.id, a.yearId])).toBe("23503");
        expect(await sqlError("INSERT INTO subjects (user_id, semester_id, name) VALUES ($1, $2, 'x')", [B.id, a.semesterId])).toBe("23503");
        expect(await sqlError("INSERT INTO chapters (user_id, subject_id, title) VALUES ($1, $2, 'x')", [B.id, a.subjectId])).toBe("23503");
        expect(await sqlError("INSERT INTO evaluations (user_id, subject_id, title, date) VALUES ($1, $2, 'x', '2026-12-01')", [B.id, a.subjectId])).toBe("23503");
    });

    it("liaison évaluation↔chapitre entre deux comptes", async () => {
        // évaluation de B + chapitre de A
        expect(await sqlError("INSERT INTO evaluation_chapters (evaluation_id, chapter_id, user_id) VALUES ($1, $2, $3)", [b.evaluationId, a.chapterId, B.id])).toBe("23503");
        // évaluation de A attribuée à B
        expect(await sqlError("INSERT INTO evaluation_chapters (evaluation_id, chapter_id, user_id) VALUES ($1, $2, $3)", [a.evaluationId, b.chapterId, B.id])).toBe("23503");
    });

    it("user_id est obligatoire (plus de valeur par défaut)", async () => {
        expect(await sqlError("INSERT INTO years (label) VALUES ('x')")).toBe("23502");
    });

    it("deux comptes peuvent avoir le même ics_uid et la même URL d'abonnement", () => {
        expect(sharedUidOwners).toEqual([A.id, B.id].sort());
        expect(sharedUrlCount).toBe(2);
    });
});

describe("après toutes les attaques, les données de A sont intactes", () => {
    it("photographie identique", async () => {
        expect(await snapshot(A, a)).toEqual(before);
    });
});

describe("suppression de compte", () => {
    it("supprime toutes les données de B, et seulement les siennes", async () => {
        expectStatus(await B.agent.delete("/api/auth/me").send({ password: "mauvais mot de passe" }), 403);
        expectStatus(await B.agent.delete("/api/auth/me").send({ password: PASSWORD }), 204);

        for (const table of ["years", "semesters", "subjects", "chapters", "evaluations", "evaluation_chapters", "calendar_events", "calendar_sources", "sessions"]) {
            const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [B.id]);
            expect(rows[0].n, table).toBe(0);
        }
        expect((await pool.query("SELECT 1 FROM users WHERE id = $1", [B.id])).rowCount).toBe(0);
        expect(await snapshot(A, a)).toEqual(before);
    });

    it("l'ancienne session de B ne donne plus accès à rien", async () => {
        const res = await B.agent.get("/api/tree");
        expect(res.status === 401 || (res.status === 200 && res.body.length === 0)).toBe(true);
    });
});