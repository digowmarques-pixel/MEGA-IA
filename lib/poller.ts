import { db } from "./db";
import { refreshGeneration } from "./generation";

declare global {
  // eslint-disable-next-line no-var
  var __hubPoller: NodeJS.Timeout | undefined;
}

export function startPoller() {
  if (global.__hubPoller) return;
  global.__hubPoller = setInterval(async () => {
    try {
      const rows = db().prepare("SELECT id FROM generations WHERE status = 'processing' AND provider_job_ids IS NOT NULL AND provider_job_ids != '[]' ORDER BY id LIMIT 24").all() as { id: number }[];
      for (const r of rows) await refreshGeneration(r.id);
    } catch (e) {
      console.error("poller", e);
    }
  }, 15_000);
}
