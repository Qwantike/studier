import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { expect } from "vitest";
import { createApp } from "../app.js";

export const app = createApp();
export type Agent = ReturnType<typeof request.agent>;
export type Res = request.Response;

export const PASSWORD = "correct horse battery";

export interface TestUser { agent: Agent; id: string; email: string }

let counter = 0;
export const uniqueEmail = (label: string) => `${label}-${Date.now()}-${counter++}@test.local`;

/** Statut attendu ; en cas d'échec, le corps de la réponse est affiché. */
export function expectStatus(res: Res, status: number): Res {
    expect(res.status, `réponse : ${JSON.stringify(res.body)}`).toBe(status);
    return res;
}

export async function newUser(label = "user"): Promise<TestUser> {
    const email = uniqueEmail(label);
    const agent = request.agent(app);
    const res = expectStatus(await agent.post("/api/auth/register").send({ email, password: PASSWORD, display_name: label }), 201);
    return { agent, id: res.body.id as string, email };
}

// --- Serveur .ics local ---
export const makeIcs = (uids: string[]): string => {
    const fmt = (t: number) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const base = Date.now() + 86_400_000;
    const events = uids.map((uid, i) => [
        "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${fmt(Date.now())}`,
        `DTSTART:${fmt(base + i * 7_200_000)}`, `DTEND:${fmt(base + i * 7_200_000 + 3_600_000)}`,
        `SUMMARY:Cours ${uid}`, "END:VEVENT",
    ].join("\r\n"));
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", ...events, "END:VCALENDAR", ""].join("\r\n");
};

export interface IcsServer {
    url: string;
    port: number;
    hits: number;
    body: string;
    /** Réponse personnalisée (redirection, gros corps…) ; undefined = sert `body`. */
    handler?: (req: http.IncomingMessage, res: http.ServerResponse) => void;
    close: () => Promise<void>;
}

export async function startIcsServer(uids = ["shared-1", "shared-2", "shared-3"]): Promise<IcsServer> {
    const state = { hits: 0, body: makeIcs(uids), handler: undefined } as Pick<IcsServer, "hits" | "body" | "handler">;
    const server = http.createServer((req, res) => {
        state.hits++;
        if (state.handler) return state.handler(req, res);
        res.writeHead(200, { "Content-Type": "text/calendar" });
        res.end(state.body);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    return Object.assign(state, {
        port, url: `http://127.0.0.1:${port}/cal.ics`,
        close: () => new Promise<void>((resolve) => { server.close(() => resolve()); }),
    });
}

/** Port local où personne n'écoute (connexion refusée). */
export async function closedPort(): Promise<number> {
    const s = await startIcsServer();
    const port = s.port;
    await s.close();
    return port;
}

// --- Jeu de données complet d'un utilisateur ---
export interface Graph {
    yearId: string; year2Id: string; semesterId: string; subjectId: string;
    chapterId: string; chapter2Id: string; evaluationId: string; eventId: string; sourceId: string;
}

/** Crée un jeu complet. Les libellés commencent par `tag` pour repérer toute fuite dans une réponse. */
export async function buildGraph(u: TestUser, icsUrl: string, tag: string): Promise<Graph> {
    const post = async (url: string, body: unknown, status = 201) => expectStatus(await u.agent.post(url).send(body as object), status).body;
    const year = await post("/api/years", { label: `${tag}-annee-1` });
    const year2 = await post("/api/years", { label: `${tag}-annee-2` });
    const semester = await post("/api/semesters", { year_id: year.id, label: `${tag}-semestre` });
    const subject = await post("/api/subjects", { semester_id: semester.id, name: `${tag}-matiere` });
    const chapter = await post("/api/chapters", { subject_id: subject.id, title: `${tag}-chapitre-1`, content_md: `${tag} contenu confidentiel` });
    const chapter2 = await post("/api/chapters", { subject_id: subject.id, title: `${tag}-chapitre-2` });
    const evaluation = await post("/api/evaluations", {
        subject_id: subject.id, title: `${tag}-evaluation`, date: "2026-12-01", grade: 15, coefficient: 2, chapter_ids: [chapter.id],
    });
    const event = await post("/api/calendar-events", {
        title: `${tag}-evenement`, starts_at: "2026-11-05T09:00:00Z", ends_at: "2026-11-05T10:00:00Z", subject_id: subject.id,
    });
    const source = await post("/api/calendar-sources", { url: icsUrl, name: `${tag}-calendrier` });
    return {
        yearId: year.id, year2Id: year2.id, semesterId: semester.id, subjectId: subject.id,
        chapterId: chapter.id, chapter2Id: chapter2.id, evaluationId: evaluation.id, eventId: event.id, sourceId: source.source.id,
    };
}

/** Photographie de ce que voit l'utilisateur : sert à prouver qu'une attaque n'a rien modifié. */
export async function snapshot(u: TestUser, g: Graph) {
    const get = async (url: string) => expectStatus(await u.agent.get(url), 200).body;
    return {
        tree: await get("/api/tree"),
        chapter: await get(`/api/chapters/${g.chapterId}`),
        chapter2: await get(`/api/chapters/${g.chapter2Id}`),
        evaluation: await get(`/api/evaluations/${g.evaluationId}`),
        events: await get("/api/calendar-events?from=2000-01-01T00:00:00Z&to=2100-01-01T00:00:00Z"),
        sources: await get("/api/calendar-sources"),
    };
}