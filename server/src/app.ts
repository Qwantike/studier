import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config.js";
import { errorHandler, notFound } from "./errors.js";
import { requireAuth, sameOrigin } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { chaptersRouter, semestersRouter, subjectsRouter, yearsRouter } from "./routes/hierarchy.js";
import { calendarSourcesRouter } from "./routes/calendarSources.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { calendarRouter } from "./routes/calendar.js";
import { evaluationsRouter } from "./routes/evaluations.js";
import { treeRouter } from "./routes/tree.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", env.TRUST_PROXY);
  app.use(helmet());
  app.use(cors({ origin: env.APP_ORIGINS, credentials: true }));
  app.use(cookieParser());
  app.use("/api", sameOrigin);
  app.use("/api", healthRouter);
  // Corps limité à 10 Ko tant que la personne n'est pas authentifiée.
  app.use("/api/auth", express.json({ limit: "10kb" }), authRouter);
  // Tout ce qui suit exige une session valide.
  app.use("/api", requireAuth);
  app.use(express.json({ limit: "5mb" })); // le contenu Markdown peut être volumineux
  app.use("/api", treeRouter);
  app.use("/api/years", yearsRouter);
  app.use("/api/semesters", semestersRouter);
  app.use("/api/subjects", subjectsRouter);
  app.use("/api/chapters", chaptersRouter);
  app.use("/api/evaluations", evaluationsRouter);
  app.use("/api", calendarRouter);
  app.use("/api/calendar-sources", calendarSourcesRouter);
  app.use("/api", dashboardRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}