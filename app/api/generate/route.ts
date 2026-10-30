import { handle, requireUser } from "@/lib/auth";
import { createGeneration, type GenerateRequest } from "@/lib/generation";
import { getAssets } from "@/lib/assets";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = (await req.json()) as GenerateRequest;
  const gen = await createGeneration(user, body);
  const assets = getAssets("a.generation_id = ?", [gen.id]);
  const failed = gen.status === "failed";
  return Response.json({ generation: gen, assets, error: failed ? gen.error : undefined }, { status: failed ? 422 : 200 });
});
