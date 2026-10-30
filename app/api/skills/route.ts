import { handle, requireUser } from "@/lib/auth";
import { loadSkills } from "@/lib/claude";

export const GET = handle(async () => {
  await requireUser();
  return Response.json({ skills: loadSkills().map((s) => ({ file: s.file, name: s.name, applies: s.applies })) });
});
