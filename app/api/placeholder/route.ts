import { parsePlaceholderUrl } from "@/lib/placeholder";

export async function GET(req: Request) {
  const { svg } = parsePlaceholderUrl(req.url);
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=31536000, immutable" } });
}
