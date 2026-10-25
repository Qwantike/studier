import { createApp } from "./app.js";
import { env } from "./config.js";
import { startScheduler } from "./services/calendarSources.js";

createApp().listen(env.PORT, "127.0.0.1", () => console.log(`API : http://127.0.0.1:${env.PORT}/api/health`));
startScheduler(env.CALENDAR_SYNC_MINUTES);
