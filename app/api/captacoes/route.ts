import { NextRequest, NextResponse } from "next/server";
import { createCaptacaoTask } from "@/lib/clickup";
import { buildTaskName } from "@/lib/naming";
import { Marca, MARCAS, SUBMARCAS_BY_MARCA, pontosFromDuracaoHoras } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface CreateCaptacaoBody {
  titulo: string;
  marca: Marca;
  submarcaUuid: string;
  data: string; // "YYYY-MM-DD"
  horaInicio: string; // "HH:mm"
  horaFim: string; // "HH:mm"
  local?: string;
  solicitante?: string;
  prioridade: "urgent" | "high" | "normal" | "low";
}

function parseLocalDateTime(data: string, hora: string): Date {
  const [year, month, day] = data.split("-").map(Number);
  const [hour, minute] = hora.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export async function POST(req: NextRequest) {
  let body: CreateCaptacaoBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.titulo || !body.marca || !body.submarcaUuid || !body.data || !body.horaInicio || !body.horaFim) {
    return NextResponse.json({ error: "Campos obrigatórios ausentes" }, { status: 400 });
  }

  if (!MARCAS.includes(body.marca)) {
    return NextResponse.json({ error: `Marca inválida: ${body.marca}` }, { status: 400 });
  }

  const submarcaValida = SUBMARCAS_BY_MARCA[body.marca].some((s) => s.uuid === body.submarcaUuid);
  if (!submarcaValida) {
    return NextResponse.json({ error: "Sub-marca não pertence à marca informada" }, { status: 400 });
  }

  const inicio = parseLocalDateTime(body.data, body.horaInicio);
  const fim = parseLocalDateTime(body.data, body.horaFim);

  if (fim <= inicio) {
    return NextResponse.json({ error: "Horário de fim deve ser depois do início" }, { status: 400 });
  }

  const duracaoHoras = (fim.getTime() - inicio.getTime()) / (1000 * 60 * 60);
  const { pontos, precisaConfirmar } = pontosFromDuracaoHoras(duracaoHoras);

  const name = buildTaskName({ marca: body.marca, titulo: body.titulo, inicio });

  const descriptionLines = [
    body.local ? `Local: ${body.local}` : null,
    body.solicitante ? `Solicitante: ${body.solicitante}` : null,
  ].filter(Boolean);

  try {
    const task = await createCaptacaoTask({
      name,
      description: descriptionLines.join("\n"),
      startDateMs: inicio.getTime(),
      dueDateMs: fim.getTime(),
      empresaUuid: body.submarcaUuid,
      pontos,
      priority: body.prioridade,
    });

    return NextResponse.json({
      task: { id: task.id, name: task.name, url: task.url },
      pontos,
      precisaConfirmarPontuacao: precisaConfirmar,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
