import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db/pool.js";
import { PASSWORD, app, expectStatus, newUser, uniqueEmail, type TestUser } from "./helpers.js";

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const cookiesOf = (res: request.Response): string[] => (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
const cookieValue = (cookies: string[], name: string) => cookies.find((c) => c.startsWith(`${name}=`))?.split(";")[0];

/** Connexion « brute » (sans jar de cookies) : renvoie les cookies tels que le navigateur les recevrait. */
async function rawLogin(email: string, password = PASSWORD) {
    const res = expectStatus(await request(app).post("/api/auth/login").send({ email, password }), 200);
    const cookies = cookiesOf(res);
    return { cookies, access: cookieValue(cookies, "access_token")!, refresh: cookieValue(cookies, "refresh_token")! };
}

afterAll(async () => { await pool.end(); });

describe("routes protégées", () => {
    const protectedRoutes: [string, string][] = [
        ["get", "/api/auth/me"], ["get", "/api/tree"], ["get", "/api/years"], ["get", "/api/semesters"], ["get", "/api/subjects"],
        ["get", "/api/chapters"], ["get", "/api/evaluations"], ["get", "/api/dashboard"], ["get", "/api/calendar-sources"],
        ["get", "/api/calendar-events?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z"],
        ["post", "/api/years"], ["post", "/api/chapters"], ["post", "/api/evaluations"], ["post", "/api/calendar-events"],
        ["post", "/api/calendar-sources"], ["post", "/api/calendar-sources/sync-all"], ["post", "/api/calendar/import"],
        ["delete", "/api/calendar/imported"], ["post", "/api/auth/password"], ["post", "/api/auth/logout-all"], ["delete", "/api/auth/me"],
    ];
    for (const [method, url] of protectedRoutes) {
        it(`${method.toUpperCase()} ${url} sans session → 401`, async () => {
            const res = await (request(app) as unknown as Record<string, (u: string) => request.Test>)[method]!(url).send({});
            expect(res.status).toBe(401);
        });
    }

    it("la santé et la configuration restent publiques", async () => {
        expectStatus(await request(app).get("/api/health"), 200);
        const cfg = expectStatus(await request(app).get("/api/auth/config"), 200);
        expect(cfg.body).toEqual({ allow_signup: true });
    });
});

describe("inscription et connexion", () => {
    it("l'inscription ouvre une session avec des cookies httpOnly bien délimités", async () => {
        const res = expectStatus(await request(app).post("/api/auth/register").send({ email: uniqueEmail("reg"), password: PASSWORD }), 201);
        expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
        const cookies = cookiesOf(res);
        const access = cookies.find((c) => c.startsWith("access_token="))!;
        const refresh = cookies.find((c) => c.startsWith("refresh_token="))!;
        expect(access).toMatch(/HttpOnly/i);
        expect(access).toMatch(/Path=\/api(;|$)/);
        expect(access).toMatch(/SameSite=Lax/i);
        expect(refresh).toMatch(/HttpOnly/i);
        expect(refresh).toMatch(/Path=\/api\/auth/);
    });

    it("le refresh token n'est jamais stocké en clair", async () => {
        const u = await newUser("hash");
        const { refresh } = await rawLogin(u.email);
        const token = refresh.split("=")[1]!;
        const { rows } = await pool.query("SELECT token_hash FROM sessions WHERE user_id = $1", [u.id]);
        expect(rows.length).toBeGreaterThan(0);
        for (const r of rows) { expect(r.token_hash).not.toBe(token); expect(r.token_hash).toMatch(/^[0-9a-f]{64}$/); }
        const { rows: users } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [u.id]);
        expect(users[0].password_hash).toMatch(/^scrypt\$/);
        expect(users[0].password_hash).not.toContain(PASSWORD);
    });

    it("email déjà pris (casse ignorée) → 409 ; mot de passe trop court → 400 ; email invalide → 400", async () => {
        const u = await newUser("dup");
        expectStatus(await request(app).post("/api/auth/register").send({ email: u.email.toUpperCase(), password: PASSWORD }), 409);
        expectStatus(await request(app).post("/api/auth/register").send({ email: uniqueEmail("short"), password: "court" }), 400);
        expectStatus(await request(app).post("/api/auth/register").send({ email: "pas-un-email", password: PASSWORD }), 400);
    });

    it("mauvais mot de passe et email inconnu donnent la même réponse", async () => {
        const u = await newUser("wrong");
        const bad = expectStatus(await request(app).post("/api/auth/login").send({ email: u.email, password: "mauvais mot de passe" }), 401);
        const unknown = expectStatus(await request(app).post("/api/auth/login").send({ email: uniqueEmail("nobody"), password: PASSWORD }), 401);
        expect(bad.body).toEqual(unknown.body);
    });

    it("le compte hérité (sans mot de passe) ne peut pas se connecter", async () => {
        expectStatus(await request(app).post("/api/auth/login").send({ email: "legacy@invalid.local", password: PASSWORD }), 401);
        expectStatus(await request(app).post("/api/auth/login").send({ email: "legacy@invalid.local", password: "" }), 400);
    });

    it("connexion insensible à la casse de l'email", async () => {
        const u = await newUser("case");
        expectStatus(await request(app).post("/api/auth/login").send({ email: u.email.toUpperCase(), password: PASSWORD }), 200);
    });
});

describe("JWT d'accès", () => {
    let u: TestUser;
    beforeAll(async () => { u = await newUser("jwt"); });

    const bearer = (token: string) => request(app).get("/api/tree").set("Cookie", `access_token=${token}`);

    it("un JWT valide est accepté", async () => {
        const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(u.id).setExpirationTime("5m").sign(secret);
        expectStatus(await bearer(token), 200);
    });

    it("expiré, mauvaise clé, falsifié, sans sujet → 401", async () => {
        const expired = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(u.id)
            .setIssuedAt(Math.floor(Date.now() / 1000) - 3600).setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(secret);
        const wrongKey = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(u.id).setExpirationTime("5m")
            .sign(new TextEncoder().encode("une-autre-cle-secrete-de-48-caracteres-minimum!!"));
        const noSubject = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(secret);
        const valid = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(u.id).setExpirationTime("5m").sign(secret);
        const tampered = `${valid.slice(0, -4)}AAAA`;
        const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(`{"sub":"${u.id}"}`).toString("base64url")}.`;
        for (const token of [expired, wrongKey, noSubject, tampered, none, "n'importe quoi"]) expectStatus(await bearer(token), 401);
    });

    it("un JWT pour un utilisateur inexistant ne donne accès à aucune donnée", async () => {
        const ghost = await new SignJWT({}).setProtectedHeader({ alg: "HS256" })
            .setSubject("11111111-1111-4111-8111-111111111111").setExpirationTime("5m").sign(secret);
        const res = await bearer(ghost);
        expect(res.status === 401 || (res.status === 200 && res.body.length === 0)).toBe(true);
    });
});

describe("refresh et déconnexion", () => {
    it("le refresh token redonne un JWT d'accès valable", async () => {
        const u = await newUser("refresh");
        const { refresh } = await rawLogin(u.email);
        const res = expectStatus(await request(app).post("/api/auth/refresh").set("Cookie", refresh), 204);
        const access = cookieValue(cookiesOf(res), "access_token")!;
        expectStatus(await request(app).get("/api/tree").set("Cookie", access), 200);
    });

    it("sans refresh token ou avec un faux → 401", async () => {
        expectStatus(await request(app).post("/api/auth/refresh"), 401);
        expectStatus(await request(app).post("/api/auth/refresh").set("Cookie", "refresh_token=faux"), 401);
    });

    it("après la déconnexion, le refresh token est mort", async () => {
        const u = await newUser("logout");
        const { refresh } = await rawLogin(u.email);
        expectStatus(await request(app).post("/api/auth/logout").set("Cookie", refresh), 204);
        expectStatus(await request(app).post("/api/auth/refresh").set("Cookie", refresh), 401);
    });

    it("« se déconnecter partout » tue toutes les sessions", async () => {
        const u = await newUser("all");
        const one = await rawLogin(u.email);
        const two = await rawLogin(u.email);
        const res = expectStatus(await request(app).post("/api/auth/logout-all").set("Cookie", one.access), 204);
        expect(cookiesOf(res).join(";")).toMatch(/access_token=;/);
        expectStatus(await request(app).post("/api/auth/refresh").set("Cookie", one.refresh), 401);
        expectStatus(await request(app).post("/api/auth/refresh").set("Cookie", two.refresh), 401);
    });

    it("une session expirée en base est refusée", async () => {
        const u = await newUser("expired");
        const { refresh } = await rawLogin(u.email);
        await pool.query("UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE user_id = $1", [u.id]);
        expectStatus(await request(app).post("/api/auth/refresh").set("Cookie", refresh), 401);
    });
});

describe("profil et mot de passe", () => {
    it("changer le mot de passe coupe les autres appareils, garde celui-ci", async () => {
        const u = await newUser("pw");
        const here = await rawLogin(u.email);
        const other = await rawLogin(u.email);
        const NEW = "un tout nouveau mot de passe";
        const cookie = `${here.access}; ${here.refresh}`;

        expectStatus(await request(app).post("/api/auth/password").set("Cookie", cookie).send({ current_password: "faux", new_password: NEW }), 403);
        expectStatus(await request(app).post("/api/auth/password").set("Cookie", cookie).send({ current_password: PASSWORD, new_password: "court" }), 400);
        expectStatus(await request(app).post("/api/auth/password").set("Cookie", cookie).send({ current_password: PASSWORD, new_password: NEW }), 204);

        expectStatus(await request(app).post("/api/auth/refresh").set("Cookie", other.refresh), 401);
        expectStatus(await request(app).post("/api/auth/refresh").set("Cookie", here.refresh), 204);
        expectStatus(await request(app).post("/api/auth/login").send({ email: u.email, password: PASSWORD }), 401);
        expectStatus(await request(app).post("/api/auth/login").send({ email: u.email, password: NEW }), 200);
    });

    it("changer d'email exige le mot de passe actuel, et refuse un email déjà pris", async () => {
        const u = await newUser("mail");
        const other = await newUser("taken");
        const next = uniqueEmail("renamed");
        expectStatus(await u.agent.patch("/api/auth/me").send({ email: next }), 403);
        expectStatus(await u.agent.patch("/api/auth/me").send({ email: next, current_password: "faux" }), 403);
        expectStatus(await u.agent.patch("/api/auth/me").send({ email: other.email, current_password: PASSWORD }), 409);
        const ok = expectStatus(await u.agent.patch("/api/auth/me").send({ email: next.toUpperCase(), current_password: PASSWORD }), 200);
        expect(ok.body.email).toBe(next);
    });

    it("le nom affiché se change sans mot de passe, et /me ne divulgue pas le hash", async () => {
        const u = await newUser("name");
        expectStatus(await u.agent.patch("/api/auth/me").send({ display_name: "Nouveau nom" }), 200);
        const me = expectStatus(await u.agent.get("/api/auth/me"), 200);
        expect(me.body.display_name).toBe("Nouveau nom");
        expect(Object.keys(me.body).sort()).toEqual(["created_at", "display_name", "email", "id"]);
    });
});

describe("protection CSRF et corps de requête", () => {
    it("une requête qui modifie des données depuis une autre origine → 403", async () => {
        const u = await newUser("csrf");
        expectStatus(await u.agent.post("/api/years").set("Origin", "https://evil.example").send({ label: "x" }), 403);
        expectStatus(await request(app).post("/api/auth/login").set("Origin", "https://evil.example").send({ email: u.email, password: PASSWORD }), 403);
    });

    it("l'origine de l'interface est acceptée, et les lectures ne sont pas concernées", async () => {
        const u = await newUser("origin");
        expectStatus(await u.agent.post("/api/years").set("Origin", "http://localhost:5173").send({ label: "x" }), 201);
        expectStatus(await u.agent.get("/api/years").set("Origin", "https://evil.example"), 200);
    });

    it("corps trop gros avant authentification → 413 ; JSON invalide → 400", async () => {
        expectStatus(await request(app).post("/api/auth/login").send({ email: "a@b.cd", password: "x".repeat(20_000) }), 413);
        expectStatus(await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{pas du json"), 400);
    });
});