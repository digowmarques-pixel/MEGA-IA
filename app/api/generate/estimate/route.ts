import { handle, requireUser } from "@/lib/auth";
import { estimate, type GenerateRequest } from "@/lib/generation";
import { resolveWallet, balance } from "@/lib/wallet";
import { db } from "@/lib/db";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = (await req.json()) as GenerateRequest;
  const e = await estimate(body);
  let projectId = body.projectId ?? null;
  if (body.sceneId) projectId = (db().prepare("SELECT project_id FROM scenes WHERE id = ?").get(body.sceneId) as { project_id: number } | undefined)?.project_id ?? projectId;
  else if (body.scenarioId) projectId = (db().prepare("SELECT project_id FROM scenarios WHERE id = ?").get(body.scenarioId) as { project_id: number } | undefined)?.project_id ?? projectId;
  let wallet = null;
  try {
    const w = resolveWallet(user.id, projectId, body.wallet);
    wallet = { ...w, balance: balance(w.type, w.id) };
  } catch (err) {
    return Response.json({ ...e, wallet: null, walletError: err instanceof Error ? err.message : String(err) });
  }
  return Response.json({ ...e, wallet });
});
