import { NextRequest, NextResponse } from "next/server";
import { isValidSession, SESSION_COOKIE_NAME } from "@/lib/auth";

// Rotas acessíveis sem sessão de navegador:
// - /login e /api/login: a própria tela de entrada.
// - /api/logout: precisa ser chamável mesmo com sessão inválida/expirada.
// - /api/sync: chamado pelo cron externo (cron-job.org), autenticado pelo CRON_SECRET,
//   nunca por um navegador logado.
const PUBLIC_PATHS = ["/login", "/api/login", "/api/logout", "/api/sync"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authenticated = await isValidSession(cookie);

  if (authenticated) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
