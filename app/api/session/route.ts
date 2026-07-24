import { NextRequest, NextResponse } from "next/server";
import { getValidSession, SESSION_COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Usado pelo Header pra decidir se mostra os links de gestor (Calendário/Sair/Master). */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await getValidSession(cookie);
  return NextResponse.json({
    authenticated: session !== null,
    name: session?.name ?? null,
    role: session?.role ?? null,
  });
}
