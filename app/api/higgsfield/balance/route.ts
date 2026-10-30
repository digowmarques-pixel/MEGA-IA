import { handle, requireUser } from "@/lib/auth";
import { higgsfield, higgsfieldMode } from "@/lib/provider";

let cache: { at: number; data: unknown } | null = null;

export const GET = handle(async () => {
  await requireUser();
  if (cache && Date.now() - cache.at < 60_000) return Response.json(cache.data);
  try {
    const b = await higgsfield().balance();
    const data = { mode: higgsfieldMode(), credits: b.credits, plan: b.plan ?? null };
    cache = { at: Date.now(), data };
    return Response.json(data);
  } catch (e) {
    return Response.json({ mode: higgsfieldMode(), credits: null, plan: null, error: e instanceof Error ? e.message : String(e) });
  }
});
