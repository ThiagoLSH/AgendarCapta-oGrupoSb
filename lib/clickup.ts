import { CLICKUP, CUSTOM_FIELDS, FIXED_FIELD_VALUES } from "./config";

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

  return res.json() as Promise<T>;
}

export interface ClickUpCustomFieldValue {
  id: string;
  value: unknown;
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
  status: { status: string };
  custom_fields: ClickUpCustomFieldValue[];
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
}

const PRIORITY_MAP: Record<CreateCaptacaoInput["priority"], number> = {
  urgent: 1,
  high: 2,
  normal: 3,
  low: 4,
};

/** Cria uma task de captação na lista House Quatro5 com todos os campos de negócio já preenchidos. */
export async function createCaptacaoTask(input: CreateCaptacaoInput): Promise<ClickUpTask> {
  const body = {
    name: input.name,
    description: input.description ?? "",
    assignees: [Number(CLICKUP.thiagoUserId)],
    priority: PRIORITY_MAP[input.priority],
    start_date: input.startDateMs,
    start_date_time: true,
    due_date: input.dueDateMs,
    due_date_time: true,
    custom_fields: [
      { id: CUSTOM_FIELDS.empresa, value: [input.empresaUuid] },
      { id: CUSTOM_FIELDS.tarefasSkill, value: [FIXED_FIELD_VALUES.tarefasSkillCaptacao] },
      { id: CUSTOM_FIELDS.tipoDemanda, value: FIXED_FIELD_VALUES.tipoDemandaCaptacao },
      { id: CUSTOM_FIELDS.pontoAtividadeMkt, value: String(input.pontos) },
    ],
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

export function getCustomFieldValue(task: ClickUpTask, fieldId: string): unknown {
  return task.custom_fields.find((f) => f.id === fieldId)?.value;
}
