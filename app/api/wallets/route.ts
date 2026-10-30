import { handle, requireUser } from "@/lib/auth";
import { walletsFor, defaultWallet, usdPerCredit } from "@/lib/wallet";

export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const projectId = Number(new URL(req.url).searchParams.get("projectId")) || null;
  return Response.json({ wallets: walletsFor(user.id, projectId), default: defaultWallet(user.id, projectId), usdPerCredit: usdPerCredit() });
});
