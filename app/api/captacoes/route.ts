import { NextRequest, NextResponse } from "next/server";
import { addTaskDependency, createCaptacaoTask, createRoteiroTask } from "@/lib/clickup";
import { buildRoteiroTaskName, buildTaskName } from "@/lib/naming";
import { Marca, MARCAS, SUBMARCAS_BY_MARCA, pontosFromDuracaoHoras } from "@/lib/config";
import { syncSingleTask } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface CreateCaptacaoBody {
  titulo: string;
  marca: Marca;
  submarcaUuid: string;
  data: string; // "YYYY-MM-DD"
  horaInicio: string; // "HH:mm"
  horaFim: string; // "HH:mm"
  local: string;
  solicitante: string;
  quemSeraCaptado: string;
  briefing: string;
  roteiroPronto: boolean;
  roteiroTexto?: string;
  /** true quando um PDF será enviado logo em seguida via /api/captacoes/[taskId]/anexo */
  roteiroTemArquivo?: boolean;
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

  const camposObrigatorios: (keyof CreateCaptacaoBody)[] = [
    "titulo",
    "marca",
    "submarcaUuid",
    "data",
    "horaInicio",
    "horaFim",
    "local",
    "solicitante",
    "quemSeraCaptado",
    "briefing",
  ];
  const faltando = camposObrigatorios.filter((campo) => !body[campo]);
  if (faltando.length > 0 || typeof body.roteiroPronto !== "boolean") {
    return NextResponse.json(
      { error: `Campos obrigatórios ausentes: ${faltando.join(", ") || "roteiroPronto"}` },
      { status: 400 }
    );
  }

  if (body.roteiroPronto && !body.roteiroTexto && !body.roteiroTemArquivo) {
    return NextResponse.json(
      { error: "Roteiro é obrigatório quando já está pronto (texto ou PDF)" },
      { status: 400 }
    );
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
    `Local: ${body.local}`,
    `Solicitante: ${body.solicitante}`,
    `Quem será captado: ${body.quemSeraCaptado}`,
    "",
    "Briefing:",
    body.briefing,
    "",
    body.roteiroPronto
      ? body.roteiroTexto
        ? `Roteiro:\n${body.roteiroTexto}`
        : "Roteiro: anexado em PDF (ver anexos da task)."
      : null,
  ].filter((line): line is string => line !== null);

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

    let roteiroTask: { id: string; name: string; url: string } | null = null;
    let roteiroTaskError: string | null = null;

    if (!body.roteiroPronto) {
      try {
        const created = await createRoteiroTask({
          name: buildRoteiroTaskName({ marca: body.marca, titulo: body.titulo }),
          description: `Briefing:\n${body.briefing}\n\nCaptação relacionada: ${task.url}`,
          empresaUuid: body.submarcaUuid,
        });
        await addTaskDependency(task.id, created.id);
        roteiroTask = { id: created.id, name: created.name, url: created.url };
      } catch (err) {
        roteiroTaskError = err instanceof Error ? err.message : String(err);
      }
    }

    let calendarSyncError: string | null = null;
    try {
      await syncSingleTask(task);
    } catch (err) {
      // A task no ClickUp já foi criada com sucesso — um erro aqui não deve derrubar
      // a resposta, só avisar. O cron periódico tenta de novo depois.
      calendarSyncError = err instanceof Error ? err.message : String(err);
    }

    return NextResponse.json({
      task: { id: task.id, name: task.name, url: task.url },
      pontos,
      precisaConfirmarPontuacao: precisaConfirmar,
      calendarSyncError,
      roteiroTask,
      roteiroTaskError,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
