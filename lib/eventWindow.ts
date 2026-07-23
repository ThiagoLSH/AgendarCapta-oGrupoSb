import { ClickUpTask, getCustomFieldValue } from "./clickup";
import { CUSTOM_FIELDS, Marca, SUBMARCAS_BY_MARCA } from "./config";
import { guessPeriodoFromTaskName, PERIODO_HORA_PADRAO } from "./naming";

export const UUID_TO_MARCA: Record<string, Marca> = Object.fromEntries(
  (Object.entries(SUBMARCAS_BY_MARCA) as [Marca, { label: string; uuid: string }[]][]).flatMap(
    ([marca, options]) => options.map((opt) => [opt.uuid, marca] as const)
  )
);

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

export function marcaFromTask(task: ClickUpTask): Marca | null {
  const value = getCustomFieldValue(task, CUSTOM_FIELDS.empresa);
  if (!Array.isArray(value) || value.length === 0) return null;
  const uuid = value[0];
  return UUID_TO_MARCA[uuid] ?? null;
}

/**
 * Deriva o intervalo start/end do evento a partir da task.
 * A maioria das captações (principalmente as com status "aprovar", ainda não
 * confirmadas) só tem due_date preenchido, sem start_date — então priorizamos
 * start_date/due_date reais quando os dois existem, e caímos para due_date + período
 * adivinhado pelo nome (Manhã/Tarde/Noite -> 09:00/14:00/19:00) com 2h de duração padrão.
 */
export function resolveEventWindow(task: ClickUpTask): { start: Date; end: Date } | null {
  if (task.start_date && task.due_date) {
    const start = new Date(Number(task.start_date));
    const end = new Date(Number(task.due_date));
    if (end > start) return { start, end };
  }

  if (task.due_date) {
    const due = new Date(Number(task.due_date));
    const periodo = guessPeriodoFromTaskName(task.name);
    if (periodo) {
      const start = new Date(due);
      start.setHours(PERIODO_HORA_PADRAO[periodo], 0, 0, 0);
      return { start, end: new Date(start.getTime() + DEFAULT_DURATION_MS) };
    }
    return { start: due, end: new Date(due.getTime() + DEFAULT_DURATION_MS) };
  }

  return null;
}
