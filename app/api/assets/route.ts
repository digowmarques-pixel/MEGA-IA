import { handle, requireUser } from "@/lib/auth";
import { getAssets } from "@/lib/assets";

export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const q = new URL(req.url).searchParams;
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (q.get("projectId")) { where.push("a.project_id = ?"); params.push(Number(q.get("projectId"))); }
  if (q.get("kind")) { where.push("a.kind = ?"); params.push(q.get("kind")); }
  if (q.get("mine") === "1") { where.push("a.user_id = ?"); params.push(user.id); }
  if (q.get("favorites") === "1") where.push("a.favorite = 1");
  const limit = Math.min(Number(q.get("limit") || 200), 1000);
  return Response.json({ assets: getAssets(where.join(" AND "), params).slice(0, limit) });
});
