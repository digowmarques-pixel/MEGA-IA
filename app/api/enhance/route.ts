import { handle, requireUser } from "@/lib/auth";
import { enhancePrompt } from "@/lib/claude";
import { projectContext } from "@/lib/projects";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = (await req.json()) as {
    kind: string; prompt: string; model?: string; aspectRatio?: string; duration?: number;
    projectId?: number; scenarioId?: number; sceneId?: number; hasReferences?: boolean;
  };
  if (!b.prompt?.trim()) return Response.json({ error: "Escreva um prompt para otimizar" }, { status: 400 });
  const result = await enhancePrompt({
    userId: user.id, kind: b.kind, prompt: b.prompt, model: b.model, aspectRatio: b.aspectRatio, duration: b.duration,
    hasReferences: b.hasReferences, context: projectContext(b),
  });
  return Response.json(result);
});
