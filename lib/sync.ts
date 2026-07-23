import {
  ClickUpTask,
  getCustomFieldValue,
  listCaptacaoTasks,
  updateTaskDescription,
} from "./clickup";
import { createCaptacaoEvent } from "./googleCalendar";
import { CUSTOM_FIELDS, GCAL_COLOR_BY_MARCA, GOOGLE_CALENDAR, Marca, SUBMARCAS_BY_MARCA } from "./config";
import { guessPeriodoFromTaskName, PERIODO_HORA_PADRAO } from "./naming";

const UUID_TO_MARCA: Record<string, Marca> = Object.fromEntries(
  (Object.entries(SUBMARCAS_BY_MARCA) as [Marca, { label: string; uuid: string }[]][]).flatMap(
    ([marca, options]) => options.map((opt) => [opt.uuid, marca] as const)
  )
);

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

function marcaFromTask(task: ClickUpTask): Marca | null {
  const value = getCustomFieldValue(task, CUSTOM_FIELDS.empresa);
  if (!Array.isArray(value) || value.length === 0) return null;
  const uuid = value[0];
  return UUID_TO_MARCA[uuid] ?? null;
}

function alreadySynced(task: ClickUpTask): boolean {
  const description = task.description ?? task.text_content ?? "";
  return description.includes(GOOGLE_CALENDAR.syncedMarkerPrefix);
}

/**
 * Deriva o intervalo start/end do evento a partir da task.
 * Prioriza start_date/due_date reais; se ausentes, tenta extrair o período do nome
 * (Manhã/Tarde/Noite -> 09:00/14:00/19:00) com 2h de duração padrão.
 */
function resolveEventWindow(task: ClickUpTask): { start: Date; end: Date } | null {
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
    // devolve devido sem hora útil como uma janela padrão de 2h a partir da própria due_date
    return { start: due, end: new Date(due.getTime() + DEFAULT_DURATION_MS) };
  }

  return null;
}

export interface SyncResult {
  scanned: number;
  created: number;
  skippedAlreadySynced: number;
  skippedNoDueDate: number;
  errors: { taskId: string; taskName: string; error: string }[];
}

/** Varre a lista House Quatro5 e replica captações não sincronizadas para o Google Calendar dedicado. */
export async function syncCaptacoesToGoogleCalendar(): Promise<SyncResult> {
  const tasks = await listCaptacaoTasks();
  const result: SyncResult = {
    scanned: tasks.length,
    created: 0,
    skippedAlreadySynced: 0,
    skippedNoDueDate: 0,
    errors: [],
  };

  for (const task of tasks) {
    if (alreadySynced(task)) {
      result.skippedAlreadySynced += 1;
      continue;
    }

    const window = resolveEventWindow(task);
    if (!window) {
      result.skippedNoDueDate += 1;
      continue;
    }

    try {
      const marca = marcaFromTask(task);
      const eventId = await createCaptacaoEvent({
        summary: task.name,
        description: task.url,
        startIso: window.start.toISOString(),
        endIso: window.end.toISOString(),
        colorId: marca ? GCAL_COLOR_BY_MARCA[marca] : undefined,
      });

      const existingDescription = task.description ?? task.text_content ?? "";
      const marker = `${GOOGLE_CALENDAR.syncedMarkerPrefix} (event: ${eventId})`;
      const newDescription = existingDescription
        ? `${existingDescription}\n\n${marker}`
        : marker;

      await updateTaskDescription(task.id, newDescription);
      result.created += 1;
    } catch (err) {
      result.errors.push({
        taskId: task.id,
        taskName: task.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
