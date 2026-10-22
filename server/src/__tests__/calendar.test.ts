import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { env } from "../config.js";
import { pool } from "../db/pool.js";
import { syncDue } from "../services/calendarSources.js";
import { closedPort, expectStatus, makeIcs, newUser, startIcsServer, type IcsServer, type TestUser } from "./helpers.js";

let ics: IcsServer;
let U: TestUser;

beforeAll(async () => { ics = await startIcsServer(); U = await newUser("cal"); });
afterAll(async () => { await ics.close(); await pool.end(); });
beforeEach(() => { ics.handler = undefined; ics.hits = 0; ics.body = makeIcs(["shared-1", "shared-2", "shared-3"]); });

const addSource = (u: TestUser, url: string, name?: string) => u.agent.post("/api/calendar-sources").send({ url, ...(name && { name }) });
const sources = async (u: TestUser) => expectStatus(await u.agent.get("/api/calendar-sources"), 200).body as { id: string; url: string; name: string; event_count: number; last_error: string | null }[];
const eventTitles = async (u: TestUser) =>
    (expectStatus(await u.agent.get("/api/calendar-events?from=2000-01-01T00:00:00Z&to=2100-01-01T00:00:00Z"), 200).body as { title: string }[]).map((e) => e.title).sort();

describe("abonnement : ajout et synchronisation", () => {
    it("ajoute un calendrier, importe ses événements, masque l'URL dans la réponse", async () => {
        const u = await newUser("add");
        const res = expectStatus(await addSource(u, ics.url, "Ma fac"), 201);
        expect(res.body.result).toMatchObject({ created: 3, updated: 0, removed: 0 });
        expect(res.body.source.url).toBe(`http://127.0.0.1:${ics.port}/…`);
        expect(JSON.stringify(await sources(u))).not.toContain("cal.ics");
        expect(await eventTitles(u)).toEqual(["Cours shared-1", "Cours shared-2", "Cours shared-3"]);
    });

    it("doublon pour le même compte → 409, mais un autre compte peut s'abonner au même lien", async () => {
        const u = await newUser("dup"), v = await newUser("dup2");
        expectStatus(await addSource(u, ics.url), 201);
        expectStatus(await addSource(u, ics.url), 409);
        expectStatus(await addSource(v, ics.url), 201);
    });

    it("une resynchronisation retire les événements à venir supprimés à la source", async () => {
        const u = await newUser("remove");
        const added = expectStatus(await addSource(u, ics.url), 201);
        ics.body = makeIcs(["shared-1", "shared-2"]);
        const res = expectStatus(await u.agent.post(`/api/calendar-sources/${added.body.source.id}/sync`), 200);
        expect(res.body.result.removed).toBe(1);
        expect(await eventTitles(u)).toEqual(["Cours shared-1", "Cours shared-2"]);
    });

    it("un flux vide ne supprime rien", async () => {
        const u = await newUser("empty");
        const added = expectStatus(await addSource(u, ics.url), 201);
        ics.body = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\nEND:VCALENDAR\r\n";
        const res = expectStatus(await u.agent.post(`/api/calendar-sources/${added.body.source.id}/sync`), 200);
        expect(res.body.result.removed).toBe(0);
        expect(await eventTitles(u)).toHaveLength(3);
    });

    it("supprimer l'abonnement garde ou supprime les événements selon le choix", async () => {
        const u = await newUser("del"), v = await newUser("del2");
        const a = expectStatus(await addSource(u, ics.url), 201), b = expectStatus(await addSource(v, ics.url), 201);
        expectStatus(await u.agent.delete(`/api/calendar-sources/${a.body.source.id}`), 204);
        expect(await eventTitles(u)).toHaveLength(3);
        expectStatus(await v.agent.delete(`/api/calendar-sources/${b.body.source.id}?delete_events=true`), 204);
        expect(await eventTitles(v)).toHaveLength(0);
    });
});

describe("limites par utilisateur", () => {
    it("10 abonnements au maximum", async () => {
        const u = await newUser("max");
        for (let i = 0; i < 10; i++) {
            await pool.query("INSERT INTO calendar_sources (user_id, name, url, next_sync_at) VALUES ($1, $2, $3, now() + interval '1 day')",
                [u.id, `s${i}`, `https://exemple.test/${i}.ics`]);
        }
        const res = expectStatus(await addSource(u, ics.url), 400);
        expect(res.body.error.message).toMatch(/Limite de 10/);
    });

    it("débit limité : 10 requêtes par minute puis 429", async () => {
        const u = await newUser("rate");
        let last = 0;
        for (let i = 0; i < 11; i++) last = (await u.agent.post("/api/calendar-sources/sync-all")).status;
        expect(last).toBe(429);
        // un autre compte n'est pas pénalisé
        const v = await newUser("rate2");
        expectStatus(await v.agent.post("/api/calendar-sources/sync-all"), 200);
    });
});

describe("protection SSRF (blocage des adresses internes activé)", () => {
    beforeEach(() => { env.CALENDAR_ALLOW_PRIVATE_URLS = false; });
    afterEach(() => { env.CALENDAR_ALLOW_PRIVATE_URLS = true; });

    // [libellé, URL] ; l'URL du serveur local n'existe qu'une fois le serveur démarré, d'où la fonction.
    const blockedUrls: [string, () => string][] = [
        ["IP de bouclage sur le port du serveur local", () => ics.url],
        ["http://127.0.0.1/cal.ics", () => "http://127.0.0.1/cal.ics"],
        ["http://localhost/cal.ics — résolu par le DNS vers 127.0.0.1 : bloqué à la connexion", () => "http://localhost/cal.ics"],
        ["http://169.254.169.254/latest/meta-data/ — métadonnées cloud", () => "http://169.254.169.254/latest/meta-data/"],
        ["http://10.0.0.5/cal.ics", () => "http://10.0.0.5/cal.ics"],
        ["http://192.168.1.10/cal.ics", () => "http://192.168.1.10/cal.ics"],
        ["http://172.16.0.1/cal.ics", () => "http://172.16.0.1/cal.ics"],
        ["http://0.0.0.0/cal.ics", () => "http://0.0.0.0/cal.ics"],
        ["http://2130706433/cal.ics — 127.0.0.1 écrit en décimal", () => "http://2130706433/cal.ics"],
        ["http://[::1]/cal.ics", () => "http://[::1]/cal.ics"],
        ["http://[::ffff:127.0.0.1]/cal.ics — IPv4 mappée en IPv6", () => "http://[::ffff:127.0.0.1]/cal.ics"],
        ["http://[fe80::1]/cal.ics", () => "http://[fe80::1]/cal.ics"],
        ["webcal://127.0.0.1/cal.ics", () => "webcal://127.0.0.1/cal.ics"],
    ];
    for (const [i, [label, url]] of blockedUrls.entries()) {
        it(`refuse ${label}`, async () => {
            const u = await newUser(`ssrf${i}`);
            const res = expectStatus(await addSource(u, url()), 502);
            expect(res.body.error.message).toMatch(/non autoris/);
            expect(await sources(u)).toHaveLength(0);
        });
    }

    it("refuse les ports autres que 80/443 sans même se connecter", async () => {
        const u = await newUser("port");
        const res = expectStatus(await addSource(u, "http://exemple.test:8080/cal.ics"), 502);
        expect(res.body.error.message).toMatch(/port non autorisé/);
    });

    it("refuse les protocoles autres que http(s)", async () => {
        const u = await newUser("proto");
        expectStatus(await addSource(u, "ftp://exemple.test/cal.ics"), 400);
        expectStatus(await addSource(u, "file:///etc/passwd"), 400);
        expectStatus(await addSource(u, "javascript:alert(1)"), 400);
    });

    it("revérifie chaque redirection (redirection vers les métadonnées cloud)", async () => {
        const u = await newUser("redirect");
        // Le premier saut est autorisé ; juste avant de répondre, on réactive le blocage : le second saut doit être refusé.
        ics.handler = (_req, res) => {
            env.CALENDAR_ALLOW_PRIVATE_URLS = false;
            res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
            res.end();
        };
        env.CALENDAR_ALLOW_PRIVATE_URLS = true;
        const res = expectStatus(await addSource(u, ics.url), 502);
        expect(ics.hits).toBe(1);
        expect(res.body.error.message).toMatch(/adresse non autorisée/);
    });
});

describe("téléchargement : limites et messages d'erreur", () => {
    it("trop de redirections", async () => {
        const u = await newUser("loop");
        ics.handler = (_req, res) => { res.writeHead(302, { Location: ics.url }); res.end(); };
        const res = expectStatus(await addSource(u, ics.url), 502);
        expect(res.body.error.message).toMatch(/trop de redirections/);
    });

    it("réponse de plus de 5 Mo refusée", async () => {
        const u = await newUser("big");
        ics.handler = (_req, res) => { res.writeHead(200); res.end("A".repeat(6 * 1024 * 1024)); };
        const res = expectStatus(await addSource(u, ics.url), 502);
        expect(res.body.error.message).toMatch(/trop volumineux/);
    });

    it("une page qui n'est pas un calendrier est refusée", async () => {
        const u = await newUser("html");
        ics.body = "<html><body>Page de connexion</body></html>";
        const res = expectStatus(await addSource(u, ics.url), 502);
        expect(res.body.error.message).toMatch(/ne renvoie pas un calendrier/);
    });

    it("erreur HTTP du serveur distant", async () => {
        const u = await newUser("500");
        ics.handler = (_req, res) => { res.writeHead(503); res.end(); };
        const res = expectStatus(await addSource(u, ics.url), 502);
        expect(res.body.error.message).toMatch(/503/);
    });

    it("une connexion refusée ne révèle ni l'adresse ni le code d'erreur réseau", async () => {
        const u = await newUser("refused");
        const port = await closedPort();
        const res = expectStatus(await addSource(u, `http://127.0.0.1:${port}/cal.ics`), 502);
        expect(res.body.error.message).toMatch(/connexion impossible/);
        expect(res.body.error.message).not.toMatch(/127\.0\.0\.1|ECONNREFUSED|\d{4,5}/);
    });
});

describe("planificateur (syncDue)", () => {
    const makeDue = (ids: string[]) => pool.query("UPDATE calendar_sources SET next_sync_at = now() - interval '1 minute' WHERE id = ANY($1::uuid[])", [ids]);
    const row = async (id: string) =>
        (await pool.query("SELECT failures, last_error, last_synced_at, next_sync_at > now() AS future, EXTRACT(EPOCH FROM next_sync_at - now()) / 60 AS minutes FROM calendar_sources WHERE id = $1", [id])).rows[0];

    beforeEach(async () => {
        // Les abonnements créés par d'autres tests ne doivent pas être traités ici.
        await pool.query("UPDATE calendar_sources SET next_sync_at = now() + interval '1 day'");
    });

    it("une URL partagée par deux comptes n'est téléchargée qu'une fois, et chacun reçoit ses événements", async () => {
        const u = await newUser("due1"), v = await newUser("due2");
        const a = expectStatus(await addSource(u, ics.url), 201), b = expectStatus(await addSource(v, ics.url), 201);
        ics.body = makeIcs(["shared-1", "shared-2", "shared-3", "shared-4"]);
        ics.hits = 0;
        await makeDue([a.body.source.id, b.body.source.id]);

        await syncDue();

        expect(ics.hits).toBe(1);
        expect(await eventTitles(u)).toHaveLength(4);
        expect(await eventTitles(v)).toHaveLength(4);
        for (const id of [a.body.source.id, b.body.source.id]) {
            const r = await row(id);
            expect(r.future).toBe(true);
            expect(r.failures).toBe(0);
            expect(r.minutes).toBeGreaterThan(58); // intervalle de 60 min (+ jusqu'à 1 min d'étalement)
        }
    });

    it("un abonnement qui n'est pas encore dû n'est pas touché", async () => {
        const u = await newUser("notdue");
        expectStatus(await addSource(u, ics.url), 201);
        ics.hits = 0;
        await syncDue();
        expect(ics.hits).toBe(0);
    });

    it("échecs : message mémorisé et intervalle qui double (60 → 120 min)", async () => {
        const u = await newUser("fail");
        const port = await closedPort();
        const { rows } = await pool.query(
            "INSERT INTO calendar_sources (user_id, name, url) VALUES ($1, 'cassé', $2) RETURNING id", [u.id, `http://127.0.0.1:${port}/cal.ics`]);
        const id = rows[0].id as string;

        await makeDue([id]);
        await syncDue();
        let r = await row(id);
        expect(r.failures).toBe(1);
        expect(r.last_error).toMatch(/connexion impossible/);
        expect(r.minutes).toBeGreaterThan(59);
        expect(r.minutes).toBeLessThan(61);

        await makeDue([id]);
        await syncDue();
        r = await row(id);
        expect(r.failures).toBe(2);
        expect(r.minutes).toBeGreaterThan(119);
        expect(r.minutes).toBeLessThan(121);
    });

    it("un succès après des échecs remet le compteur à zéro", async () => {
        const u = await newUser("recover");
        const { rows } = await pool.query(
            "INSERT INTO calendar_sources (user_id, name, url, failures, last_error) VALUES ($1, 'ok', $2, 3, 'ancienne erreur') RETURNING id", [u.id, ics.url]);
        const id = rows[0].id as string;
        await makeDue([id]);
        await syncDue();
        const r = await row(id);
        expect(r.failures).toBe(0);
        expect(r.last_error).toBeNull();
    });

    it("une seule instance planifie à la fois (verrou PostgreSQL)", async () => {
        const u = await newUser("lock");
        const added = expectStatus(await addSource(u, ics.url), 201);
        await makeDue([added.body.source.id]);
        ics.hits = 0;

        const other = await pool.connect(); // simule un autre processus qui tient le verrou
        try {
            await other.query("SELECT pg_advisory_lock(727001::bigint)");
            await syncDue();
            expect(ics.hits).toBe(0);
            expect((await row(added.body.source.id)).future).toBe(false); // toujours dû
        } finally {
            await other.query("SELECT pg_advisory_unlock(727001::bigint)");
            other.release();
        }
        await syncDue();
        expect(ics.hits).toBe(1);
    });
});