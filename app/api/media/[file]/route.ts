import fs from "fs";
import path from "path";
import { getSessionUser } from "@/lib/auth";
import { mediaDir, mimeFor } from "@/lib/media";

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  if (!(await getSessionUser())) return new Response("Não autenticado", { status: 401 });
  const name = path.basename((await ctx.params).file); // impede path traversal
  const file = path.join(mediaDir(), name);
  if (!fs.existsSync(file)) return new Response("Não encontrado", { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(file)), {
    headers: { "Content-Type": mimeFor(name), "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
