import { NextResponse } from "next/server";
import { deleteTask, getTask } from "@/lib/clickup";
import { deleteCaptacaoEvent } from "@/lib/googleCalendar";
import { extractGoogleEventId } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Exclui uma captação por completo: apaga o evento no Google Calendar (se já
 * sincronizado) e depois a task no ClickUp. Só o Master tem acesso (middleware).
 */
export async function DELETE(_req: Request, { params }: { params: { taskId: string } }) {
  try {
    const task = await getTask(params.taskId);
    const eventId = extractGoogleEventId(task);

    let calendarDeleteError: string | null = null;
    if (eventId) {
      try {
        await deleteCaptacaoEvent(eventId);
      } catch (err) {
        // Segue apagando a task mesmo se o evento já não existir mais no Google.
        calendarDeleteError = err instanceof Error ? err.message : String(err);
      }
    }

    await deleteTask(params.taskId);

    return NextResponse.json({ ok: true, calendarDeleteError });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
