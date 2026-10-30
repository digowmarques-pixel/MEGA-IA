import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/login", "/api/auth/login", "/api/placeholder", "/brand", "/cam/"];
// /api/cam/{código}/… é público (o código de pareamento é a senha); criar pareamento (/api/cam) exige login
const isPublicCam = (p: string) => /^\/api\/cam\/[A-Za-z0-9]{6}(\/|$)/.test(p);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p)) || isPublicCam(pathname) || pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname === "/icon.svg") {
    return NextResponse.next();
  }
  const token = req.cookies.get("hub_session")?.value;
  let ok = false;
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-troque-em-producao"));
      ok = true;
    } catch {}
  }
  if (ok) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
