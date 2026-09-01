import { NextRequest, NextResponse } from "next/server";
import { ClickUpTask, listCaptacaoTasksPage } from "@/lib/clickup";
import { isAuthorizedMktHubRequest, mapTaskToMktHubCaptacao } from "@/lib/mktHubIntegration";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function unauthorized() {
  return NextResponse.json(
    { error: "unauthorized", message: "Token inválido ou ausente." },
    { status: 401 }
  );
}

/**
 * GET /api/integrations/mkt-hub/captacoes
 * Endpoint de LEITURA pro MKT Hub 2 consumir captações — fase 1 de uma integração mão
 * única (nós expomos, eles consomem). Fora do gate de sessão de cookie do middleware
 * (mesmo padrão de /api/sync), autenticado por Bearer token próprio.
 *
 * Query params: updated_since (ISO-8601 com offset, opcional), page (0-based, default 0),
 * limit (default 50, máximo 100).
 *
 * Mecânica de paginação (documentada explicitamente, não é 1:1 trivial): o ClickUp só
 * pagina em blocos FIXOS de até 100 tasks por índice de página, sem tamanho de página
 * customizado. Pra expor um `limit` arbitrário (<=100) sem criar lacunas — ou seja, sem
 * nunca "pular" itens que caem no meio de um bloco de 100 do ClickUp — calculamos um
 * índice virtual (`page * limit`) sobre a lista completa filtrada, e buscamos quantos
 * blocos de 100 do ClickUp forem necessários pra cobrir esse intervalo, mesmo que isso
 * signifique buscar o mesmo bloco do ClickUp mais de uma vez em páginas nossas
 * diferentes (aceitável pra fase 1: são poucas centenas de tasks no total). `has_more` é
 * calculado como: (já temos, nos blocos buscados, mais itens além do fim da nossa
 * página) OU (o último bloco buscado não é a última página, segundo `last_page`).
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedMktHubRequest(req)) {
    return unauthorized();
  }

  const { searchParams } = new URL(req.url);

  const updatedSinceParam = searchParams.get("updated_since");
  let dateUpdatedGreaterThan: number | undefined;
  if (updatedSinceParam) {
    const parsed = new Date(updatedSinceParam);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "invalid_param", message: "updated_since precisa ser uma data ISO-8601 válida." },
        { status: 400 }
      );
    }
    dateUpdatedGreaterThan = parsed.getTime();
  }

  const pageParam = Number(searchParams.get("page") ?? "0");
  const page = Number.isInteger(pageParam) && pageParam >= 0 ? pageParam : 0;

  const limitParam = Number(searchParams.get("limit") ?? String(DEFAULT_LIMIT));
  const limit =
    Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;

  try {
    const startIndex = page * limit;
    const endIndex = startIndex + limit; // exclusivo

    let clickupPage = Math.floor(startIndex / 100);
    const absoluteOffset = clickupPage * 100;

    const collected: ClickUpTask[] = [];
    let lastPage = false;
    // Busca blocos de 100 do ClickUp, a partir do bloco que contém startIndex, até
    // acumular itens suficientes pra cobrir endIndex (ou até acabarem os blocos).
    while (true) {
      const result = await listCaptacaoTasksPage({ dateUpdatedGreaterThan, page: clickupPage });
      collected.push(...result.tasks);
      lastPage = result.lastPage;
      if (absoluteOffset + collected.length >= endIndex || lastPage || result.tasks.length < 100) {
        break;
      }
      clickupPage += 1;
    }

    const sliceStart = startIndex - absoluteOffset;
    const pageTasks = collected.slice(sliceStart, sliceStart + limit);
    const hasMore = collected.length > sliceStart + limit || !lastPage;

    const captacoes = pageTasks
      .map((t) => mapTaskToMktHubCaptacao(t))
      .filter((c): c is NonNullable<typeof c> => c !== null);

    return NextResponse.json({
      captacoes,
      page,
      limit,
      has_more: hasMore,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
