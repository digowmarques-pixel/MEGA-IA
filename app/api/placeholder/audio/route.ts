import { parsePlaceholderUrl } from "@/lib/placeholder";

export async function GET(req: Request) {
  const { audio } = parsePlaceholderUrl(req.url);
  return new Response(new Uint8Array(audio!), { headers: { "Content-Type": "audio/wav", "Cache-Control": "public, max-age=31536000, immutable" } });
}
