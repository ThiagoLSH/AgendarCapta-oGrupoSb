import { ClickUpTask, listCaptacaoTasks } from "./clickup";
import { resolveEventWindow } from "./eventWindow";

export interface EventWindow {
  start: Date;
  end: Date;
}

/**
 * Mensagem exata devolvida (e mostrada no front) quando o horário pedido colide com uma
 * captação já existente — reaproveitada tanto na checagem pré-criação quanto na checagem
 * de corrida pós-criação, e no front (app/page.tsx e CaptacaoModal.tsx).
 */
export const HORARIO_INDISPONIVEL_MESSAGE =
  "Esse horário já está reservado por outra captação. Escolha outro horário.";

/**
 * Não existe hoje, confirmado, um status de "cancelada"/"arquivada" na lista House Quatro5
 * (toda task nova cai em "pendente " — ver STATUS_PENDENTE em lib/config.ts). Filtramos por
 * substring de forma defensiva, caso esse status venha a existir no futuro, pra essas tasks
 * não contarem como ocupação de horário.
 */
const INACTIVE_STATUS_KEYWORDS = ["cancelad", "deletad", "arquivad", "excluÃ­d", "excluid"];

export function isActiveCaptacaoTask(task: ClickUpTask): boolean {
  const status = task.status?.status?.toLowerCase() ?? "";
  return !INACTIVE_STATUS_KEYWORDS.some((kw) => status.includes(kw));
}

/** Sobreposição de janelas (não só início idêntico): newStart < existingEnd && existingStart < newEnd. */
export function windowsOverlap(a: EventWindow, b: EventWindow): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/**
 * Entre as tasks informadas, retorna as que são captações ativas cuja janela [start, due]
 * (resolvida via resolveEventWindow, igual ao calendário/sync) sobrepõe a `window` pedida.
 * Conflito é GLOBAL entre marcas — mesma equipe de captação atende todas (SeuBoné, Carbone,
 * Onevo, Weevo etc), não há exceção por marca.
 */
export function findOverlappingTasks(
  window: EventWindow,
  tasks: ClickUpTask[],
  options: { excludeTaskId?: string } = {}
): ClickUpTask[] {
  return tasks.filter((t) => {
    if (options.excludeTaskId && t.id === options.excludeTaskId) return false;
    if (!isActiveCaptacaoTask(t)) return false;
    const w = resolveEventWindow(t);
    if (!w) return false;
    return windowsOverlap(window, w);
  });
}

/**
 * Busca as captações ativas na lista House Quatro5 e verifica se alguma colide com a janela
 * pedida. Usada na checagem pré-criação (antes de criar a task no ClickUp).
 */
export async function hasSchedulingConflict(
  window: EventWindow,
  options: { excludeTaskId?: string } = {}
): Promise<boolean> {
  const tasks = await listCaptacaoTasks();
  return findOverlappingTasks(window, tasks, options).length > 0;
}

/**
 * Entre tasks que se sobrepõem à mesma janela, decide qual "venceu" a reserva — sempre a
 * criada primeiro no ClickUp (date_created, epoch ms, menor valor = mais antiga).
 */
export function pickEarliestTask(tasks: ClickUpTask[]): ClickUpTask {
  return [...tasks].sort((a, b) => Number(a.date_created) - Number(b.date_created))[0];
}
