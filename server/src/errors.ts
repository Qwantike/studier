import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const notFound: RequestHandler = (req, _res, next) =>
  next(new HttpError(404, `Route introuvable : ${req.method} ${req.path}`));

// Format d'erreur unique : { error: { message, details? } }
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: { message: "Données invalides", details: err.flatten().fieldErrors } });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { message: err.message } });
    return;
  }
  // Erreurs de body-parser (corps trop gros, JSON mal formé) : sinon elles finiraient en 500.
  const type = (err as { type?: string }).type;
  if (type === "entity.too.large") {
    res.status(413).json({ error: { message: "Requête trop volumineuse" } });
    return;
  }
  if (type === "entity.parse.failed") {
    res.status(400).json({ error: { message: "JSON invalide" } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { message: "Erreur interne du serveur" } });
};