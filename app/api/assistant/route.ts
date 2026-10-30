import { handle, requireUser } from "@/lib/auth";
import { assistantStream, type ChatMessage } from "@/lib/claude";
import { projectContext } from "@/lib/projects";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = (await req.json()) as { messages: ChatMessage[]; projectId?: number; scenarioId?: number; sceneId?: number };
  const messages = (b.messages || []).filter((m) => m.content?.trim()).slice(-30);
  if (!messages.length || messages[messages.length - 1].role !== "user") return Response.json({ error: "Mensagem vazia" }, { status: 400 });
  return new Response(assistantStream({ userId: user.id, messages, context: projectContext(b) }), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
});
