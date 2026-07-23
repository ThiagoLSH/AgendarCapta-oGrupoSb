import { NextRequest, NextResponse } from "next/server";
import { computeSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

export async function POST(req: NextRequest) {
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    return NextResponse.json(
      { error: "APP_PASSWORD não configurado no servidor." },
      { status: 500 }
    );
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (body.password !== appPassword) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  const token = await computeSessionToken(appPassword);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS_SECONDS,
  });
  return res;
}
