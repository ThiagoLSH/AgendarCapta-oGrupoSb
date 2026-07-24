import { NextRequest, NextResponse } from "next/server";
import { getValidSession, SESSION_COOKIE_NAME } from "@/lib/auth";

// Só a visualização do calendário geral exige login de gestor — marcar uma captação
// (a página inicial "/" e /api/captacoes) fica aberto pra qualquer um, sem senha nenhuma.
const MANAGER_PATHS = ["/calendario", "/api/tasks"];
// O painel de administração (excluir captação, gerenciar gestores) exige role "master".
const MASTER_PATHS = ["/admin", "/api/admin"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const needsMaster = MASTER_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const needsManager =
    needsMaster || MANAGER_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (!needsManager) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await getValidSession(cookie);

  const authorized = session !== null && (!needsMaster || session.role === "master");

  if (authorized) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: session ? "Acesso restrito ao Master." : "Não autenticado." },
      { status: session ? 403 : 401 }
    );
  }

  if (session) {
    // Logado, mas sem permissão de Master — manda pro calendário em vez do login.
    return NextResponse.redirect(new URL("/calendario", req.url));
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/calendario", "/api/tasks", "/admin", "/api/admin/:path*"],
};
