import { CLICKUP, CUSTOM_FIELDS, FIXED_FIELD_VALUES, STATUS_PENDENTE } from "./config";

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

function getToken(): string {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) {
    throw new Error(
      "CLICKUP_API_TOKEN não configurado. Gere um token pessoal em ClickUp > Configurações > Apps e defina em .env.local"
    );
  }
  return token;
}

async function clickupFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CLICKUP_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: getToken(),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ClickUp API ${res.status} ${res.statusText} em ${path}: ${body}`);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export interface ClickUpCustomFieldValue {
  id: string;
  value: unknown;
}

export interface ClickUpAssignee {
  id: number;
  username: string;
  email: string | null;
}

export interface ClickUpTask {
  id: string;
  name: string;
  description?: string;
  text_content?: string;
  date_created: string;
  date_updated: string;
  start_date: string | null;
  due_date: string | null;
  url: string;
  // `type` é o campo nativo do ClickUp que categoriza o status (open/unstarted/custom/
  // done/closed), independente do texto exibido — é o único jeito confiável de agrupar
  // status em "estados" de negócio sem depender de nomes que podem mudar/ter acento.
  status: { status: string; type?: string };
  custom_fields: ClickUpCustomFieldValue[];
  assignees?: ClickUpAssignee[];
}

export interface CreateCaptacaoInput {
  name: string;
  description?: string;
  /** epoch ms */
  startDateMs: number;
  /** epoch ms */
  dueDateMs: number;
  empresaUuid: string;
  pontos: number;
  priority: "urgent" | "high" | "normal" | "low";
  telefoneSolicitante?: string;
  telefoneCaptado?: string;
}

const PRIORITY_MAP: Record<CreateCaptacaoInput["priority"], number> = {
  urgent: 1,
  high: 2,
  normal: 3,
  low: 4,
};

/** Cria uma task de captação na lista House Quatro5 com todos os campos de negócio já preenchidos. */
export async function createCaptacaoTask(input: CreateCaptacaoInput): Promise<ClickUpTask> {
  const customFields: ClickUpCustomFieldValue[] = [
    { id: CUSTOM_FIELDS.empresa, value: [input.empresaUuid] },
    { id: CUSTOM_FIELDS.tarefasSkill, value: [FIXED_FIELD_VALUES.tarefasSkillCaptacao] },
    { id: CUSTOM_FIELDS.tipoDemanda, value: FIXED_FIELD_VALUES.tipoDemandaCaptacao },
    { id: CUSTOM_FIELDS.pontoAtividadeMkt, value: String(input.pontos) },
  ];
  // Só entram no payload depois que o campo correspondente existir de verdade no ClickUp
  // (UUID preenchido em lib/config.ts) — usados pelo fluxo de WhatsApp (n8n).
  if (CUSTOM_FIELDS.telefoneSolicitante && input.telefoneSolicitante) {
    customFields.push({ id: CUSTOM_FIELDS.telefoneSolicitante, value: input.telefoneSolicitante });
  }
  if (CUSTOM_FIELDS.telefoneCaptado && input.telefoneCaptado) {
    customFields.push({ id: CUSTOM_FIELDS.telefoneCaptado, value: input.telefoneCaptado });
  }

  const body = {
    name: input.name,
    description: input.description ?? "",
    assignees: [Number(CLICKUP.thiagoUserId)],
    priority: PRIORITY_MAP[input.priority],
    status: STATUS_PENDENTE,
    start_date: input.startDateMs,
    start_date_time: true,
    due_date: input.dueDateMs,
    due_date_time: true,
    custom_fields: customFields,
  };

  return clickupFetch<ClickUpTask>(`/list/${CLICKUP.listId}/task`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface ListCaptacaoTasksOptions {
  /** epoch ms — filtra por due_date >= */
  dueDateGreaterThan?: number;
  /** epoch ms — filtra por due_date <= */
  dueDateLessThan?: number;
  /**
   * epoch ms — filtra por date_updated > (nativo do ClickUp, `date_updated_gt`,
   * confirmado por teste empírico). Opcional, usado hoje só pelo endpoint de integração
   * MKT Hub (/api/integrations/mkt-hub/captacoes) pra puxar o conjunto completo filtrado
   * por `updated_since` antes de paginar. Não afeta quem já chama `listCaptacaoTasks()`
   * sem passar esse campo.
   */
  dateUpdatedGreaterThan?: number;
}

/**
 * Lista tasks da lista House Quatro5 marcadas como captação.
 * Filtra direto na API do ClickUp pelo campo "Tarefas SKILL" = Captação, em vez de
 * paginar a lista inteira (compartilhada com todo o time de marketing, milhares de
 * tasks históricas) e filtrar no cliente — isso é o que fazia o scan levar ~1min e
 * estourar o timeout das funções serverless na Vercel.
 */
export async function listCaptacaoTasks(options: ListCaptacaoTasksOptions = {}): Promise<ClickUpTask[]> {
  const params = new URLSearchParams();
  params.set("include_closed", "true");
  params.set("subtasks", "true");
  params.set(
    "custom_fields",
    JSON.stringify([
      { field_id: CUSTOM_FIELDS.tarefasSkill, operator: "ANY", value: [FIXED_FIELD_VALUES.tarefasSkillCaptacao] },
    ])
  );
  if (options.dueDateGreaterThan) params.set("due_date_gt", String(options.dueDateGreaterThan));
  if (options.dueDateLessThan) params.set("due_date_lt", String(options.dueDateLessThan));
  if (options.dateUpdatedGreaterThan) params.set("date_updated_gt", String(options.dateUpdatedGreaterThan));

  const allTasks: ClickUpTask[] = [];
  let page = 0;
  // ClickUp pagina em blocos de até 100 tasks.
  while (true) {
    params.set("page", String(page));
    const data = await clickupFetch<{ tasks: ClickUpTask[] }>(
      `/list/${CLICKUP.listId}/task?${params.toString()}`
    );
    allTasks.push(...data.tasks);
    if (data.tasks.length < 100) break;
    page += 1;
  }

  return allTasks;
}

/** Atualiza a descrição de uma task (usado para gravar o marcador de sincronização). */
export async function updateTaskDescription(taskId: string, description: string): Promise<void> {
  await clickupFetch(`/task/${taskId}`, {
    method: "PUT",
    body: JSON.stringify({ description }),
  });
}

export async function getTask(taskId: string): Promise<ClickUpTask> {
  return clickupFetch<ClickUpTask>(`/task/${taskId}`);
}

/** Apaga a task no ClickUp (usado pelo painel Master pra excluir uma captação). */
export async function deleteTask(taskId: string): Promise<void> {
  await clickupFetch(`/task/${taskId}`, { method: "DELETE" });
}

export function getCustomFieldValue(task: ClickUpTask, fieldId: string): unknown {
  return task.custom_fields.find((f) => f.id === fieldId)?.value;
}

export interface CreateRoteiroInput {
  name: string;
  description: string;
  empresaUuid: string;
}

/**
 * Cria a task de roteiro pro Zion escrever, quando quem marcou a captação não tem
 * roteiro pronto. Fica na mesma lista House Quatro5, sem os campos de pontuação de
 * captação (não é uma task de captação).
 */
export async function createRoteiroTask(input: CreateRoteiroInput): Promise<ClickUpTask> {
  const body = {
    name: input.name,
    description: input.description,
    assignees: [Number(CLICKUP.zionUserId)],
    status: STATUS_PENDENTE,
    custom_fields: [
      { id: CUSTOM_FIELDS.empresa, value: [input.empresaUuid] },
      { id: CUSTOM_FIELDS.tarefasSkill, value: [FIXED_FIELD_VALUES.tarefasSkillRoteiro] },
      { id: CUSTOM_FIELDS.tipoDemanda, value: FIXED_FIELD_VALUES.tipoDemandaRedacao },
    ],
  };

  return clickupFetch<ClickUpTask>(`/list/${CLICKUP.listId}/task`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Marca `taskId` como esperando (waiting on) `dependsOnTaskId` no ClickUp. */
export async function addTaskDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
  await clickupFetch(`/task/${taskId}/dependency`, {
    method: "POST",
    body: JSON.stringify({ depends_on: dependsOnTaskId }),
  });
}

export interface CreateEdicaoInput {
  name: string;
  description: string;
  empresaUuid: string;
  pontos: number;
  /** "video" -> Klenio / "Edição de vídeo"; "foto" -> Thiago / "Edição de foto" */
  tipo: "foto" | "video";
}

/**
 * Cria a task de edição, automaticamente junto de toda captação — sem data (edição não
 * tem horário marcado, só entra na fila). Vídeo vai pro Klenio, foto vai pro Thiago. Fica
 * na mesma lista House Quatro5.
 */
export async function createEdicaoTask(input: CreateEdicaoInput): Promise<ClickUpTask> {
  const assigneeId = input.tipo === "foto" ? CLICKUP.thiagoUserId : CLICKUP.klenioUserId;
  const skillFieldValue =
    input.tipo === "foto" ? FIXED_FIELD_VALUES.tarefasSkillEdicaoFoto : FIXED_FIELD_VALUES.tarefasSkillEdicaoVideo;

  const body = {
    name: input.name,
    description: input.description,
    assignees: [Number(assigneeId)],
    status: STATUS_PENDENTE,
    custom_fields: [
      { id: CUSTOM_FIELDS.empresa, value: [input.empresaUuid] },
      { id: CUSTOM_FIELDS.tarefasSkill, value: [skillFieldValue] },
      { id: CUSTOM_FIELDS.tipoDemanda, value: FIXED_FIELD_VALUES.tipoDemandaEdicao },
      { id: CUSTOM_FIELDS.pontoAtividadeMkt, value: String(input.pontos) },
    ],
  };

  return clickupFetch<ClickUpTask>(`/list/${CLICKUP.listId}/task`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Cria um link entre duas tasks (referência cruzada, sem bloquear nada — diferente de
 * dependência). Usado pra ligar a captação à task de edição sem prender uma na outra.
 */
export async function addTaskLink(taskId: string, linksToTaskId: string): Promise<void> {
  await clickupFetch(`/task/${taskId}/link/${linksToTaskId}`, { method: "POST" });
}

/** Posta um comentário no chat da task (usado pra avisar da task de edição criada). */
export async function createTaskComment(taskId: string, commentText: string): Promise<void> {
  await clickupFetch(`/task/${taskId}/comment`, {
    method: "POST",
    body: JSON.stringify({ comment_text: commentText, notify_all: false }),
  });
}

/** Anexa um arquivo (ex: roteiro em PDF) a uma task já existente. */
export async function uploadTaskAttachment(
  taskId: string,
  file: Blob,
  filename: string
): Promise<void> {
  const formData = new FormData();
  formData.append("attachment", file, filename);

  const res = await fetch(`${CLICKUP_API_BASE}/task/${taskId}/attachment`, {
    method: "POST",
    headers: { Authorization: getToken() },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ClickUp API ${res.status} ${res.statusText} ao anexar arquivo: ${body}`);
  }
}
