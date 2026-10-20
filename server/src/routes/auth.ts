import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../config.js";
import { pool } from "../db/pool.js";
import { HttpError } from "../errors.js";
import { requireAuth, uid } from "../middleware/auth.js";
import {
    REFRESH_COOKIE, USER_COLS, clearAuthCookies, destroySession, destroySessions, dummyHash, hashPassword,
    refreshSession, setAccessCookie, signAccess, startSession, verifyPassword, type PublicUser,
} from "../services/auth.js";
import { ah } from "./crud.js";

const email = z.string().trim().toLowerCase().email("Email invalide").max(254);
const newPassword = z.string().min(10, "10 caractères minimum").max(200);
const registerSchema = z.object({ email, password: newPassword, display_name: z.string().trim().max(100).optional() });
const loginSchema = z.object({ email, password: z.string().min(1).max(200) });
const patchSchema = z.object({
    display_name: z.string().trim().max(100).optional(),
    email: email.optional(),
    current_password: z.string().max(200).optional(),
});
const passwordSchema = z.object({ current_password: z.string().min(1).max(200), new_password: newPassword });
const deleteSchema = z.object({ password: z.string().min(1).max(200) });

// Freine le brute-force (en mémoire : suffisant pour une instance ; à passer sur Redis si plusieurs instances).
const limiter = rateLimit({
    windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true,
    message: { error: { message: "Trop de tentatives, réessayez dans quelques minutes" } },
});

const isUnique = (err: unknown) => (err as { code?: string }).code === "23505";
const refreshCookie = (req: { cookies?: Record<string, unknown> }) => {
    const t = req.cookies?.[REFRESH_COOKIE];
    return typeof t === "string" ? t : undefined;
};

export const authRouter = Router();

// Indique au client s'il doit proposer la création de compte.
authRouter.get("/config", (_req, res) => { res.json({ allow_signup: env.ALLOW_SIGNUP }); });

authRouter.post("/register", limiter, ah(async (req, res) => {
    if (!env.ALLOW_SIGNUP) throw new HttpError(403, "Les inscriptions sont fermées");
    const body = registerSchema.parse(req.body);
    const hash = await hashPassword(body.password);
    try {
        const { rows } = await pool.query<PublicUser>(
            `INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING ${USER_COLS}`,
            [body.email, hash, body.display_name ?? ""]);
        await startSession(req, res, rows[0]!.id);
        res.status(201).json(rows[0]);
    } catch (err) {
        if (isUnique(err)) throw new HttpError(409, "Un compte existe déjà avec cet email");
        throw err;
    }
}));

authRouter.post("/login", limiter, ah(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const { rows } = await pool.query<PublicUser & { password_hash: string | null }>(
        `SELECT ${USER_COLS}, password_hash FROM users WHERE email = $1`, [body.email]);
    const u = rows[0];
    const ok = await verifyPassword(body.password, u?.password_hash ?? (await dummyHash()));
    if (!u || !u.password_hash || !ok) throw new HttpError(401, "Email ou mot de passe incorrect");
    await pool.query("UPDATE users SET last_login_at = now() WHERE id = $1", [u.id]);
    await startSession(req, res, u.id);
    const { password_hash: _omit, ...user } = u;
    res.json(user);
}));

// Renouvelle le JWT d'accès à partir du refresh token (appelé par le client sur un 401).
authRouter.post("/refresh", ah(async (req, res) => {
    const token = refreshCookie(req);
    const userId = token ? await refreshSession(token) : null;
    if (!userId) { clearAuthCookies(res); throw new HttpError(401, "Session expirée"); }
    setAccessCookie(res, await signAccess(userId));
    res.status(204).end();
}));

authRouter.post("/logout", ah(async (req, res) => {
    const token = refreshCookie(req);
    if (token) await destroySession(token);
    clearAuthCookies(res);
    res.status(204).end();
}));

authRouter.post("/logout-all", requireAuth, ah(async (req, res) => {
    await destroySessions(uid(req));
    clearAuthCookies(res);
    res.status(204).end();
}));

authRouter.get("/me", requireAuth, ah(async (req, res) => {
    const { rows } = await pool.query<PublicUser>(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [uid(req)]);
    if (!rows[0]) throw new HttpError(401, "Non connecté");
    res.json(rows[0]);
}));

authRouter.patch("/me", requireAuth, ah(async (req, res) => {
    const body = patchSchema.parse(req.body);
    const { rows } = await pool.query<PublicUser & { password_hash: string | null }>(
        `SELECT ${USER_COLS}, password_hash FROM users WHERE id = $1`, [uid(req)]);
    const cur = rows[0];
    if (!cur) throw new HttpError(401, "Non connecté");
    // Changer d'email demande le mot de passe actuel.
    if (body.email !== undefined && body.email !== cur.email
        && !(body.current_password && await verifyPassword(body.current_password, cur.password_hash ?? ""))) {
        throw new HttpError(403, "Mot de passe actuel incorrect");
    }
    try {
        const upd = await pool.query<PublicUser>(
            `UPDATE users SET email = COALESCE($2, email), display_name = COALESCE($3, display_name)
       WHERE id = $1 RETURNING ${USER_COLS}`, [cur.id, body.email ?? null, body.display_name ?? null]);
        res.json(upd.rows[0]);
    } catch (err) {
        if (isUnique(err)) throw new HttpError(409, "Un compte existe déjà avec cet email");
        throw err;
    }
}));

// Change le mot de passe et déconnecte tous les autres appareils.
authRouter.post("/password", requireAuth, limiter, ah(async (req, res) => {
    const body = passwordSchema.parse(req.body);
    const { rows } = await pool.query<{ password_hash: string | null }>(
        "SELECT password_hash FROM users WHERE id = $1", [uid(req)]);
    if (!(await verifyPassword(body.current_password, rows[0]?.password_hash ?? ""))) {
        throw new HttpError(403, "Mot de passe actuel incorrect");
    }
    await pool.query("UPDATE users SET password_hash = $2 WHERE id = $1", [uid(req), await hashPassword(body.new_password)]);
    await destroySessions(uid(req), refreshCookie(req));
    res.status(204).end();
}));

// Suppression du compte et de toutes ses données (cascade).
authRouter.delete("/me", requireAuth, limiter, ah(async (req, res) => {
    const { password } = deleteSchema.parse(req.body);
    const { rows } = await pool.query<{ password_hash: string | null }>(
        "SELECT password_hash FROM users WHERE id = $1", [uid(req)]);
    if (!(await verifyPassword(password, rows[0]?.password_hash ?? ""))) throw new HttpError(403, "Mot de passe incorrect");
    await pool.query("DELETE FROM users WHERE id = $1", [uid(req)]);
    clearAuthCookies(res);
    res.status(204).end();
}));