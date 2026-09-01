import { NextResponse } from "next/server";
import { deleteTask, getTask } from "@/lib/clickup";
import { deleteCaptacaoEvent } from "@/lib/googleCalendar";
import { mapTaskToMktHubCaptacao, toMktHubSnapshot } from "@/lib/mktHubIntegration";
import { registrarCancelamento } from "@/lib/mktHubTombstones";
import { extrairTrechoBriefing } from "@/lib/naming";
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

    // Registra o cancelamento pro MKT Hub ANTES de apagar de verdade — não temos permissão
    // pra criar status novo no ClickUp, então esse é o único jeito do MKT Hub saber que a
    // captação foi cancelada em vez de simplesmente sumir. Falha aqui não pode travar a
    // exclusão real (mesma filosofia de "falha de sync nunca derruba o fluxo principal").
    //
    // Monta o mesmo retrato que os endpoints de leitura do MKT Hub produziriam pra essa
    // task se ela ainda estivesse viva (reaproveitando `task`, já buscado acima), pra um
    // cancelamento não devolver todos os campos `null` de uma vez pro MKT Hub. Se a janela
    // do evento não for resolvível (caso raro/de borda — nem start/due_date), registra o
    // tombstone mesmo assim, só sem o snapshot extra (fallback pro comportamento antigo).
    try {
      const captacaoViva = mapTaskToMktHubCaptacao(task);
      const snapshot = captacaoViva ? toMktHubSnapshot(captacaoViva) : undefined;
      // O briefing completo, aqui, é truncado (mesma extração usada no título das tasks de
      // edição, lib/naming.ts) antes de ir pro Edge Config — o store inteiro é limitado a
      // 1MB (Hobby/Pro), dividido com a chave "managers", e um briefing longo por
      // cancelamento, multiplicado pelos 60 dias de retenção, comia esse espaço rápido
      // demais. Vale só pro que fica gravado no tombstone: uma captação AGENDADA continua
      // devolvendo o briefing inteiro nos endpoints de leitura (mapTaskToMktHubCaptacao,
      // usado em cima, não é afetado por esse corte).
      if (snapshot) {
        snapshot.briefing = extrairTrechoBriefing(snapshot.briefing);
      }
      await registrarCancelamento(params.taskId, snapshot);
    } catch (err) {
      console.error("Falha ao registrar cancelamento pro MKT Hub:", err);
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
