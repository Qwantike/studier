import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../config.js";
import { pool } from "../db/pool.js";

export const LEGACY_USER_ID = "00000000-0000-0000-0000-000000000001";
export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";
const ACCESS_TTL_S = 15 * 60;
const REFRESH_TTL_S = 30 * 24 * 3600;

export interface PublicUser { id: string; email: string; display_name: string; created_at: string }
export const USER_COLS = "id, email, display_name, created_at";

// --- Mots de passe : scrypt (module crypto de Node, aucune dépendance native) ---
const N = 2 ** 15, R = 8, P = 1;
const scryptAsync = (pw: string, salt: Buffer, len: number, opts: ScryptOptions) =>
    new Promise<Buffer>((resolve, reject) => scrypt(pw, salt, len, opts, (e, k) => (e ? reject(e) : resolve(k))));
const opts = (n: number, r: number, p: number): ScryptOptions => ({ N: n, r, p, maxmem: 128 * n * r * 2 });

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await scryptAsync(password, salt, 64, opts(N, R, P));
    return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const [algo, n, r, p, salt, hash] = stored.split("$");
    if (algo !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
    const expected = Buffer.from(hash, "base64");
    const key = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length, opts(+n, +r, +p));
    return key.length === expected.length && timingSafeEqual(key, expected);
}

// Hash factice : on fait le même travail quand l'email est inconnu (pas de différence de temps de réponse).
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(12).toString("hex")));

// --- JWT d'accès (courte durée) ---
const key = new TextEncoder().encode(env.JWT_SECRET);

export const signAccess = (userId: string) =>
    new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId)
        .setIssuedAt().setExpirationTime(`${ACCESS_TTL_S}s`).sign(key);

export async function verifyAccess(token: string): Promise<string | null> {
    try {
        const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
        return typeof payload.sub === "string" ? payload.sub : null;
    } catch { return null; }
}

// --- Cookies httpOnly (inaccessibles au JavaScript de la page) ---
const base: CookieOptions = { httpOnly: true, sameSite: "lax", secure: env.NODE_ENV === "production" };

export const setAccessCookie = (res: Response, token: string) =>
    res.cookie(ACCESS_COOKIE, token, { ...base, path: "/api", maxAge: ACCESS_TTL_S * 1000 });
const setRefreshCookie = (res: Response, token: string) =>
    res.cookie(REFRESH_COOKIE, token, { ...base, path: "/api/auth", maxAge: REFRESH_TTL_S * 1000 });

export function clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { ...base, path: "/api" });
    res.clearCookie(REFRESH_COOKIE, { ...base, path: "/api/auth" });
}

// --- Sessions (refresh token opaque, stocké haché) ---
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function startSession(req: Request, res: Response, userId: string): Promise<void> {
    const token = randomBytes(32).toString("base64url");
    await pool.query(
        `INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5::double precision))`,
        [userId, sha256(token), req.get("user-agent")?.slice(0, 300) ?? null, req.ip ?? null, REFRESH_TTL_S]);
    void pool.query("DELETE FROM sessions WHERE expires_at < now()").catch(() => undefined);
    setAccessCookie(res, await signAccess(userId));
    setRefreshCookie(res, token);
}

/** Valide le refresh token, prolonge la session et renvoie l'utilisateur (null si invalide/expiré). */
export async function refreshSession(token: string): Promise<string | null> {
    const { rows } = await pool.query<{ user_id: string }>(
        `UPDATE sessions SET last_used_at = now(), expires_at = now() + make_interval(secs => $2::double precision)
     WHERE token_hash = $1 AND expires_at > now() RETURNING user_id`, [sha256(token), REFRESH_TTL_S]);
    return rows[0]?.user_id ?? null;
}

export const destroySession = (token: string) =>
    pool.query("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);

/** Supprime les sessions de l'utilisateur ; garde celle du refresh token donné si keepToken est fourni. */
export const destroySessions = (userId: string, keepToken?: string) =>
    pool.query("DELETE FROM sessions WHERE user_id = $1 AND ($2::text IS NULL OR token_hash <> $2)",
        [userId, keepToken ? sha256(keepToken) : null]);