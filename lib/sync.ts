import { ClickUpTask, listCaptacaoTasks, updateTaskDescription } from "./clickup";
import { createCaptacaoEvent } from "./googleCalendar";
import { GCAL_COLOR_BY_MARCA, GOOGLE_CALENDAR } from "./config";
import { marcaFromTask, resolveEventWindow } from "./eventWindow";

function alreadySynced(task: ClickUpTask): boolean {
  const description = task.description ?? task.text_content ?? "";
  return description.includes(GOOGLE_CALENDAR.syncedMarkerPrefix);
}

/**
 * Extrai o ID do evento do Google Calendar do marcador gravado na descrição da task.
 * Aceita tanto "(event: id)" (formato atual) quanto "(evento id)" (formato do
 * protótipo antigo no Cowork), sem depender de crachá específico de pontuação.
 */
export function extractGoogleEventId(task: ClickUpTask): string | null {
  const description = task.description ?? task.text_content ?? "";
  const match = description.match(/\(event[o]?:?\s+([a-z0-9_-]+)\)/i);
  return match ? match[1] : null;
}

/**
 * Cria o evento no Google Calendar dedicado pra uma task e grava o marcador de
 * sincronização na descrição. Usada tanto pela criação de captação (sync imediato)
 * quanto pelo cron periódico (sync das que passaram batidas, ex: geradas fora do site).
 * Retorna null se a task não tem due_date (não dá pra posicionar no calendário) ou já
 * estava sincronizada.
 */
export async function syncSingleTask(task: ClickUpTask): Promise<{ eventId: string } | null> {
  if (alreadySynced(task)) return null;

  const window = resolveEventWindow(task);
  if (!window) return null;

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
  const newDescription = existingDescription ? `${existingDescription}\n\n${marker}` : marker;

  await updateTaskDescription(task.id, newDescription);
  return { eventId };
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

    if (!resolveEventWindow(task)) {
      result.skippedNoDueDate += 1;
      continue;
    }

    try {
      const synced = await syncSingleTask(task);
      if (synced) result.created += 1;
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
