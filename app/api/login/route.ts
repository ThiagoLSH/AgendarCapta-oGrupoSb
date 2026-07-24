import { NextRequest, NextResponse } from "next/server";
import { getManagers, SESSION_COOKIE_NAME, verifyLoginAndBuildCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

export async function POST(req: NextRequest) {
  const managers = await getManagers();
  if (managers.length === 0) {
    return NextResponse.json(
      { error: "Nenhum gestor configurado no servidor (Edge Config vazio)." },
      { status: 500 }
    );
  }

  let body: { name?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.name || !body.password) {
    return NextResponse.json({ error: "Informe nome e senha." }, { status: 400 });
  }

  const cookieValue = await verifyLoginAndBuildCookie(body.name, body.password);
  if (!cookieValue) {
    return NextResponse.json({ error: "Nome ou senha incorretos." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS_SECONDS,
  });
  return res;
}
