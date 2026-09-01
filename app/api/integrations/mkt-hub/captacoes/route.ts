import { NextRequest, NextResponse } from "next/server";
import { listCaptacaoTasks } from "@/lib/clickup";
import {
  isAuthorizedMktHubRequest,
  mapCancelamentoToMktHubCaptacao,
  mapTaskToMktHubCaptacao,
  MktHubCaptacao,
} from "@/lib/mktHubIntegration";
import { getCancelamentos } from "@/lib/mktHubTombstones";

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
 * Mecânica de paginação: as captações ativas (ClickUp, via `listCaptacaoTasks`, que já
 * auto-pagina internamente todos os blocos de 100 até cobrir o filtro) e os cancelamentos
 * (Vercel Edge Config, já filtrados pelo mesmo `updated_since`) são buscados
 * INTEGRALMENTE e SEPARADAMENTE primeiro, depois combinados num único array e só então
 * paginados (`slice`) — ao contrário da estratégia anterior (paginar direto o ClickUp em
 * blocos e só misturar os cancelamentos na primeira página), que não dava pra manter
 * depois que passamos a exigir ordenação pelo conjunto inteiro (não dá pra ordenar
 * corretamente sem ter tudo em mãos antes de cortar a página).
 *
 * Ordenação: ASCENDENTE por `atualizado_em` (mais antigo primeiro). Escolha deliberada
 * pra uma API de sincronização incremental (`updated_since`): se a ordem fosse
 * descendente, um consumidor que parasse de paginar no meio (ou que rodasse a
 * sincronização enquanto novos itens continuam mudando) poderia nunca alcançar itens mais
 * antigos que ficaram "para trás" nas páginas seguintes. Em ordem ascendente, o pior caso
 * é reprocessar um item que já viu (idempotente pro consumidor), nunca perder um item.
 * Se o MKT Hub preferir o oposto (mais recente primeiro) no futuro, inverta o `sort`
 * abaixo — mas avalie o impacto na garantia de "nunca perder item" antes de trocar.
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
    const tasks = await listCaptacaoTasks({ dateUpdatedGreaterThan });
    const captacoesAtivas = tasks
      .map((t) => mapTaskToMktHubCaptacao(t))
      .filter((c): c is NonNullable<typeof c> => c !== null);

    const cancelamentos = await getCancelamentos();
    const cancelamentosFiltrados = cancelamentos.filter((entry) => {
      if (dateUpdatedGreaterThan === undefined) return true;
      const canceladoEmMs = new Date(entry.canceladoEm).getTime();
      return Number.isFinite(canceladoEmMs) && canceladoEmMs >= dateUpdatedGreaterThan;
    });
    const captacoesCanceladas = cancelamentosFiltrados.map((entry) => mapCancelamentoToMktHubCaptacao(entry));

    const combinado: MktHubCaptacao[] = [...captacoesAtivas, ...captacoesCanceladas].sort(
      (a, b) => Date.parse(a.atualizado_em) - Date.parse(b.atualizado_em)
    );

    const startIndex = page * limit;
    const endIndex = startIndex + limit;
    const captacoes = combinado.slice(startIndex, endIndex);
    const hasMore = combinado.length > endIndex;

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
