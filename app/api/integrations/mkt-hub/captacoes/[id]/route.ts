import { NextRequest, NextResponse } from "next/server";
import { getTask } from "@/lib/clickup";
import { isAuthorizedMktHubRequest, isCaptacaoTask, mapTaskToMktHubCaptacao } from "@/lib/mktHubIntegration";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function unauthorized() {
  return NextResponse.json(
    { error: "unauthorized", message: "Token inválido ou ausente." },
    { status: 401 }
  );
}

function notFound() {
  return NextResponse.json(
    { error: "not_found", message: "Captação não encontrada." },
    { status: 404 }
  );
}

/**
 * GET /api/integrations/mkt-hub/captacoes/:id
 * Busca uma captação específica por ID do ClickUp. 404 se a task não existir OU se
 * existir mas não for uma task de captação (tarefasSkill != Captação) — nesse último caso
 * de propósito não vazamos que a task existe com outro tipo.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAuthorizedMktHubRequest(req)) {
    return unauthorized();
  }

  try {
    const task = await getTask(params.id);
    if (!isCaptacaoTask(task)) {
      return notFound();
    }

    const captacao = mapTaskToMktHubCaptacao(task);
    if (!captacao) {
      return NextResponse.json(
        {
          error: "unresolvable_window",
          message: "Captação encontrada, mas sem janela de data/hora resolvível (nem start/due_date).",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(captacao);
  } catch (err) {
    // Confirmado empiricamente: pra um ID que não corresponde a nenhuma task real, o
    // ClickUp não devolve 404 — devolve 401 com ECODE "OAUTH_023"/"OAUTH_027" ("Team(s)
    // not authorized"), porque não consegue resolver o workspace/team a partir de um ID
    // inválido/inexistente antes mesmo de checar a task em si. Tratamos ESSES dois ECODEs
    // específicos como "não encontrado" pro consumidor da integração.
    //
    // Importante: NÃO tratamos qualquer 401 genericamente como 404 aqui — se o
    // CLICKUP_API_TOKEN expirar/for revogado no futuro, o ClickUp também responde 401,
    // mas com outro ECODE (ex: token inválido de verdade). Se isso caísse no mesmo "não
    // encontrado", um problema real de credencial ficaria mascarado como "captação não
    // existe" pro MKT Hub, e ninguém perceberia o token quebrado até muito depois. Por
    // isso a checagem abaixo exige o ECODE específico, não só o status 401.
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("404") || message.includes("OAUTH_023") || message.includes("OAUTH_027")) {
      return notFound();
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
