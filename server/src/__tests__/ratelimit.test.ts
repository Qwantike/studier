import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../db/pool.js";
import { app, newUser, uniqueEmail } from "./helpers.js";

afterAll(async () => { await pool.end(); });

// Fichier à part : le compteur est en mémoire et partagé par toutes les requêtes de l'application.
describe("limitation des tentatives de connexion", () => {
    it("20 échecs puis blocage (429) ; les connexions réussies ne comptent pas", async () => {
        const u = await newUser("limit");
        for (let i = 0; i < 5; i++) {
            expect((await request(app).post("/api/auth/login").send({ email: u.email, password: "correct horse battery" })).status).toBe(200);
        }
        for (let i = 0; i < 20; i++) {
            const res = await request(app).post("/api/auth/login").send({ email: uniqueEmail("x"), password: "mauvais mot de passe" });
            expect(res.status, `tentative ${i + 1}`).toBe(401);
        }
        const blocked = await request(app).post("/api/auth/login").send({ email: u.email, password: "correct horse battery" });
        expect(blocked.status).toBe(429);
        expect(blocked.body.error.message).toMatch(/Trop de tentatives/);
    });
});