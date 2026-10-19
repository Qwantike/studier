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
  console.error(err);
  res.status(500).json({ error: { message: "Erreur interne du serveur" } });
};
