import type { Request, RequestHandler } from "express";
import { env } from "../config.js";
import { HttpError } from "../errors.js";
import { ACCESS_COOKIE, verifyAccess } from "../services/auth.js";

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express { interface Request { userId?: string } }
}

/** Exige un JWT d'accès valide (cookie) ; renseigne req.userId. */
export const requireAuth: RequestHandler = (req, _res, next) => {
    const token: unknown = req.cookies?.[ACCESS_COOKIE];
    if (typeof token !== "string") return next(new HttpError(401, "Non connecté"));
    verifyAccess(token).then((id) => {
        if (!id) return next(new HttpError(401, "Session expirée"));
        req.userId = id;
        next();
    }, next);
};

/** Identifiant de l'utilisateur connecté (à utiliser dans les routes situées derrière requireAuth). */
export function uid(req: Request): string {
    if (!req.userId) throw new HttpError(401, "Non connecté");
    return req.userId;
}

/** Défense CSRF en plus de SameSite : une requête qui modifie des données doit venir de notre interface. */
export const sameOrigin: RequestHandler = (req, _res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.get("origin");
    if (origin && !env.APP_ORIGINS.includes(origin)) return next(new HttpError(403, "Origine non autorisée"));
    next();
};