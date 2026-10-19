import { Router } from "express";
import { pool } from "../db/pool.js";

export const healthRouter = Router();

// Endpoint de test : vérifie l'API et la connexion PostgreSQL.
healthRouter.get("/health", async (_req, res, next) => {
  try {
    const { rows } = await pool.query<{ now: Date }>("SELECT now()");
    res.json({ status: "ok", db: "connected", time: rows[0]?.now });
  } catch (err) { next(err); }
});
