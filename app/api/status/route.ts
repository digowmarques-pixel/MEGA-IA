import { handle, requireUser } from "@/lib/auth";
import { claudeConfigured, CLAUDE_MODEL } from "@/lib/claude";
import { higgsfieldMode } from "@/lib/provider";
import { elevenlabsConfigured } from "@/lib/providers/elevenlabs";
import { usdPerCredit } from "@/lib/wallet";

export const GET = handle(async () => {
  await requireUser();
  return Response.json({ higgsfield: higgsfieldMode(), claude: claudeConfigured() ? CLAUDE_MODEL : null, elevenlabs: elevenlabsConfigured(), usdPerCredit: usdPerCredit() });
});
