import { NextRequest, NextResponse } from "next/server";
import { getManagers, Manager, ManagerRole, saveManagers } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Lista os gestores (nome + role, nunca a senha) — usado pelo painel Master. */
export async function GET() {
  const managers = await getManagers();
  return NextResponse.json({
    managers: managers.map((m) => ({ name: m.name, role: m.role })),
  });
}

/** Adiciona um novo gestor. */
export async function POST(req: NextRequest) {
  let body: { name?: string; password?: string; role?: ManagerRole };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.name?.trim() || !body.password?.trim() || (body.role !== "gestor" && body.role !== "master")) {
    return NextResponse.json(
      { error: "Informe nome, senha e role (gestor ou master)." },
      { status: 400 }
    );
  }

  const managers = await getManagers();
  const jaExiste = managers.some((m) => m.name.trim().toLowerCase() === body.name!.trim().toLowerCase());
  if (jaExiste) {
    return NextResponse.json({ error: "Já existe um gestor com esse nome." }, { status: 409 });
  }

  const novo: Manager = { name: body.name.trim(), password: body.password, role: body.role };
  await saveManagers([...managers, novo]);

  return NextResponse.json({ ok: true, manager: { name: novo.name, role: novo.role } });
}

/** Remove um gestor pelo nome. Não deixa remover o último Master (travaria o painel). */
export async function DELETE(req: NextRequest) {
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Informe o nome do gestor a remover." }, { status: 400 });
  }

  const managers = await getManagers();
  const alvo = managers.find((m) => m.name.trim().toLowerCase() === body.name!.trim().toLowerCase());
  if (!alvo) {
    return NextResponse.json({ error: "Gestor não encontrado." }, { status: 404 });
  }

  const restantes = managers.filter((m) => m !== alvo);
  const semMasterRestante = alvo.role === "master" && !restantes.some((m) => m.role === "master");
  if (semMasterRestante) {
    return NextResponse.json(
      { error: "Não é possível remover o último Master — ninguém mais poderia gerenciar gestores." },
      { status: 400 }
    );
  }

  await saveManagers(restantes);
  return NextResponse.json({ ok: true });
}
