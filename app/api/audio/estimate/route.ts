import { handle, requireUser } from "@/lib/auth";
import { elCreditsEstimate, elToHub, scopeFrom, type AudioOp } from "@/lib/audio-jobs";
import { resolveScope } from "@/lib/generation";
import { balance, resolveWallet } from "@/lib/wallet";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = (await req.json()) as { op: AudioOp; chars?: number; modelId?: string; durationSec?: number; wallet?: "project" | "user" | "personal" | null } & Record<string, unknown>;
  const el = elCreditsEstimate(b.op, b);
  const hub = elToHub(el);
  try {
    const scope = resolveScope(scopeFrom(b));
    const w = resolveWallet(user.id, scope.projectId, b.wallet);
    return Response.json({ elCredits: el, ...hub, wallet: { ...w, balance: balance(w.type, w.id) } });
  } catch (e) {
    return Response.json({ elCredits: el, ...hub, wallet: null, walletError: e instanceof Error ? e.message : String(e) });
  }
});
