import { NextRequest, NextResponse } from "next/server";
import { getCustomFieldValue, listCaptacaoTasks } from "@/lib/clickup";
import { CUSTOM_FIELDS, SUBMARCAS_BY_MARCA, Marca } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_TO_MARCA: Record<string, Marca> = Object.fromEntries(
  (Object.entries(SUBMARCAS_BY_MARCA) as [Marca, { label: string; uuid: string }[]][]).flatMap(
    ([marca, options]) => options.map((opt) => [opt.uuid, marca] as const)
  )
);

const UUID_TO_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(SUBMARCAS_BY_MARCA).flatMap((options) => options.map((opt) => [opt.uuid, opt.label] as const))
);

/** Lista as captações da lista House Quatro5 para exibir no calendário mensal. */
export async function GET(_req: NextRequest) {
  try {
    const tasks = await listCaptacaoTasks();

    const events = tasks
      .filter((t) => t.start_date && t.due_date)
      .map((t) => {
        const empresaValue = getCustomFieldValue(t, CUSTOM_FIELDS.empresa);
        const uuid = Array.isArray(empresaValue) ? empresaValue[0] : null;
        return {
          id: t.id,
          name: t.name,
          url: t.url,
          start: Number(t.start_date),
          end: Number(t.due_date),
          marca: uuid ? UUID_TO_MARCA[uuid] ?? null : null,
          submarca: uuid ? UUID_TO_LABEL[uuid] ?? null : null,
          status: t.status.status,
        };
      });

    return NextResponse.json({ events });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
