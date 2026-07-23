import { NextRequest, NextResponse } from "next/server";
import { isValidSession, SESSION_COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Usado pelo Header para decidir se mostra os links de gestor (Calendário/Sair). */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authenticated = await isValidSession(cookie);
  return NextResponse.json({ authenticated });
}
