import { createApp } from "./app.js";
import { env } from "./config.js";
import { startScheduler } from "./services/calendarSources.js";

createApp().listen(env.PORT, () => console.log(`API : http://localhost:${env.PORT}/api/health`));
startScheduler(env.CALENDAR_SYNC_MINUTES);
