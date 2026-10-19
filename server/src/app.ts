import cors from "cors";
import express from "express";
import { errorHandler, notFound } from "./errors.js";
import { healthRouter } from "./routes/health.js";
import { chaptersRouter, semestersRouter, subjectsRouter, yearsRouter } from "./routes/hierarchy.js";
import { calendarSourcesRouter } from "./routes/calendarSources.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { calendarRouter } from "./routes/calendar.js";
import { evaluationsRouter } from "./routes/evaluations.js";
import { treeRouter } from "./routes/tree.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" })); // le contenu Markdown peut être volumineux
  app.use("/api", healthRouter);
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
