import { handle, requireUser } from "@/lib/auth";
import { closeLink, createLink } from "@/lib/camlink";

/** Computador cria (ou renova) o pareamento e recebe o código para o QR. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = (await req.json()) as { scene: unknown; state?: Record<string, unknown> };
  const l = createLink(user.id, b.scene, b.state ?? {});
  return Response.json({ code: l.code });
});

export const DELETE = handle(async (req: Request) => {
  await requireUser();
  const code = new URL(req.url).searchParams.get("code");
  if (code) closeLink(code);
  return Response.json({ ok: true });
});
