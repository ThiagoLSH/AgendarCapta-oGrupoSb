import { NextRequest, NextResponse } from "next/server";
import {
  addTaskDependency,
  addTaskLink,
  createCaptacaoTask,
  createEdicaoTask,
  createRoteiroTask,
  createTaskComment,
  deleteTask,
  listCaptacaoTasks,
} from "@/lib/clickup";
import { buildEdicaoTaskName, buildRoteiroTaskName, buildTaskName } from "@/lib/naming";
import {
  Marca,
  MARCAS,
  PONTOS_EDICAO_BASE,
  SUBMARCAS_BY_MARCA,
  TipoCaptacao,
  pontosFromDuracaoHoras,
} from "@/lib/config";
import { findOverlappingTasks, HORARIO_INDISPONIVEL_MESSAGE, pickEarliestTask } from "@/lib/conflict";
import { syncSingleTask } from "@/lib/sync";
import { fortalezaToUtc } from "@/lib/timezone";

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
  telefoneSolicitante?: string;
  quemSeraCaptado: string;
  telefoneCaptado?: string;
  briefing: string;
  tipoCaptacao: TipoCaptacao;
  roteiroPronto: boolean;
  roteiroTexto?: string;
  /** true quando um PDF será enviado logo em seguida via /api/captacoes/[taskId]/anexo */
  roteiroTemArquivo?: boolean;
  prioridade: "urgent" | "high" | "normal" | "low";
}

function parseLocalDateTime(data: string, hora: string): Date {
  const [year, month, day] = data.split("-").map(Number);
  const [hour, minute] = hora.split(":").map(Number);
  return fortalezaToUtc(year, month, day, hour, minute);
}

function horarioIndisponivelResponse() {
  return NextResponse.json(
    { error: "HORARIO_INDISPONIVEL", message: HORARIO_INDISPONIVEL_MESSAGE },
    { status: 409 }
  );
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
    "tipoCaptacao",
  ];
  const faltando = camposObrigatorios.filter((campo) => !body[campo]);
  if (faltando.length > 0 || typeof body.roteiroPronto !== "boolean") {
    return NextResponse.json(
      { error: `Campos obrigatórios ausentes: ${faltando.join(", ") || "roteiroPronto"}` },
      { status: 400 }
    );
  }

  if (!["foto", "video", "ambos"].includes(body.tipoCaptacao)) {
    return NextResponse.json({ error: `Tipo de captação inválido: ${body.tipoCaptacao}` }, { status: 400 });
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

  const requestedWindow = { start: inicio, end: fim };

  // Checagem A: conflito de horário é GLOBAL entre todas as marcas (mesma equipe de
  // captação) — não deixa nem chegar a criar a task se já tiver algo reservado na janela.
  // Se a própria checagem falhar (erro ao consultar o ClickUp), não bloqueia o fluxo: a
  // checagem de corrida logo depois de criar a task (passo B) ainda protege contra conflito.
  try {
    const existingTasks = await listCaptacaoTasks();
    if (findOverlappingTasks(requestedWindow, existingTasks).length > 0) {
      return horarioIndisponivelResponse();
    }
  } catch (err) {
    console.error("Falha ao checar conflito de horário antes de criar a task:", err);
  }

  const name = buildTaskName({ marca: body.marca, titulo: body.titulo, inicio });

  const descriptionLines = [
    `Local: ${body.local}`,
    `Solicitante: ${body.solicitante}`,
    body.telefoneSolicitante ? `WhatsApp do solicitante: ${body.telefoneSolicitante}` : null,
    `Quem será captado: ${body.quemSeraCaptado}`,
    body.telefoneCaptado ? `WhatsApp de quem será captado: ${body.telefoneCaptado}` : null,
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
      telefoneSolicitante: body.telefoneSolicitante,
      telefoneCaptado: body.telefoneCaptado,
    });

    // Checagem B: proteção contra corrida (duas pessoas enviando quase ao mesmo tempo pro
    // mesmo horário). Refaz a checagem de sobreposição já incluindo a task recém-criada —
    // se mais de uma task ativa disputar a mesma janela, só a criada primeiro no ClickUp
    // (date_created) sobrevive. Roda antes de criar roteiro/edição e antes de sincronizar
    // no Google Calendar, então perder a corrida aqui nunca deixa dependentes órfãos.
    try {
      const tasksAfterCreate = await listCaptacaoTasks();
      const pool = tasksAfterCreate.some((t) => t.id === task.id)
        ? tasksAfterCreate
        : [...tasksAfterCreate, task];
      const overlapping = findOverlappingTasks(requestedWindow, pool);

      if (overlapping.length > 1) {
        const winner = pickEarliestTask(overlapping);
        if (winner.id !== task.id) {
          await deleteTask(task.id).catch((err) =>
            console.error("Falha ao apagar task perdedora da corrida de horário:", err)
          );
          return horarioIndisponivelResponse();
        }
      }
    } catch (err) {
      console.error("Falha ao checar corrida de horário após criar a task:", err);
    }

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

    // Task(s) de edição, criadas em silêncio junto de toda captação — o solicitante nunca
    // vê nada sobre isso (nem na resposta, nem na UI). Vídeo vai pro Klenio, foto vai pro
    // Thiago; se for "ambos", cria uma task de cada. Sem data (só entra na fila), ligada
    // à captação por link cruzado (não por dependência, pra não travar uma na outra), e
    // avisada no chat da própria task de captação.
    try {
      const roteiroInfo = body.roteiroPronto
        ? body.roteiroTexto
          ? `Roteiro:\n${body.roteiroTexto}`
          : "Roteiro: anexado em PDF na task de captação."
        : "Roteiro: ainda não estava pronto na marcação — ver task de roteiro do Zion, vinculada à captação.";

      const tiposEdicao: ("foto" | "video")[] =
        body.tipoCaptacao === "ambos" ? ["video", "foto"] : [body.tipoCaptacao];

      for (const tipo of tiposEdicao) {
        const label = tipo === "foto" ? "FOTO" : "VÍDEO";
        const edicaoTask = await createEdicaoTask({
          name: buildEdicaoTaskName({
            tituloBase: `[EDIÇÃO DE ${label}] ${body.titulo}`,
            briefing: body.briefing,
          }),
          description: [
            `Briefing:\n${body.briefing}`,
            "",
            roteiroInfo,
            "",
            `Captação relacionada: ${task.url}`,
            "",
            `Pontuação inicial: ${PONTOS_EDICAO_BASE} pontos (base). Ajustar conforme a complexidade do trabalho de edição.`,
          ].join("\n"),
          empresaUuid: body.submarcaUuid,
          pontos: PONTOS_EDICAO_BASE,
          tipo,
        });
        await addTaskLink(task.id, edicaoTask.id);
        await createTaskComment(task.id, `Task de edição criada automaticamente: ${edicaoTask.url}`);
      }
    } catch (err) {
      console.error("Falha ao criar task(s) de edição automática:", err);
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
