import { NextRequest, NextResponse } from "next/server";
import { getCustomFieldValue, listCaptacaoTasks } from "@/lib/clickup";
import { CUSTOM_FIELDS, SUBMARCAS_BY_MARCA } from "@/lib/config";
import { resolveEventWindow, UUID_TO_MARCA } from "@/lib/eventWindow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_TO_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(SUBMARCAS_BY_MARCA).flatMap((options) => options.map((opt) => [opt.uuid, opt.label] as const))
);

/**
 * Lista as captações da lista House Quatro5 para exibir no calendário mensal.
 * A maioria das tasks (principalmente as com status "aprovar", ainda não confirmadas)
 * só tem due_date preenchido — por isso usamos resolveEventWindow para também
 * posicioná-las no calendário, do mesmo jeito que a sincronização com o Google faz.
 */
export async function GET(_req: NextRequest) {
  try {
    const tasks = await listCaptacaoTasks();

    const events = tasks
      .map((t) => {
        const window = resolveEventWindow(t);
        if (!window) return null;

        const empresaValue = getCustomFieldValue(t, CUSTOM_FIELDS.empresa);
        const uuid = Array.isArray(empresaValue) ? empresaValue[0] : null;
        return {
          id: t.id,
          name: t.name,
          url: t.url,
          start: window.start.getTime(),
          end: window.end.getTime(),
          marca: uuid ? UUID_TO_MARCA[uuid] ?? null : null,
          submarca: uuid ? UUID_TO_LABEL[uuid] ?? null : null,
          status: t.status.status,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    return NextResponse.json({ events });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
