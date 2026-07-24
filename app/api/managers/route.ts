import { NextResponse } from "next/server";
import { getManagers } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Só os nomes dos gestores (nunca as senhas), pra popular o seletor da tela de login. */
export async function GET() {
  const managers = await getManagers();
  return NextResponse.json({ names: managers.map((m) => m.name) });
}
