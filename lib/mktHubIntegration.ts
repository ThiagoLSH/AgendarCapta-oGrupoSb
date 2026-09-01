// Suporte à integração de leitura pro MKT Hub 2 (/api/integrations/mkt-hub/*).
// Fase 1 de uma integração mão única: nós só expomos dados, nunca recebemos escrita daqui.
// Qualquer mudança de escrita/webhook receptor é fora de escopo desse arquivo de propósito.

import crypto from "crypto";
import { NextRequest } from "next/server";
import { ClickUpTask, getCustomFieldValue } from "./clickup";
import { CUSTOM_FIELDS, FIXED_FIELD_VALUES, GOOGLE_CALENDAR, periodoFromHour, SUBMARCAS_BY_MARCA } from "./config";
import { resolveEventWindow } from "./eventWindow";
import { toFortalezaIso, toFortalezaParts } from "./timezone";

const UUID_TO_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(SUBMARCAS_BY_MARCA).flatMap((options) => options.map((opt) => [opt.uuid, opt.label] as const))
);

/**
 * Confere o header `Authorization: Bearer <token>` contra `MKT_HUB_API_TOKEN`, em tempo
 * constante (timingSafeEqual). Buffers de tamanhos diferentes fariam `timingSafeEqual`
 * lançar exceção — por isso comparamos primeiro um hash de tamanho fixo (sha256) dos dois
 * valores, o que também nivela o tamanho sem vazar informação sobre o tamanho do token
 * real via timing.
 */
export function isAuthorizedMktHubRequest(req: NextRequest): boolean {
  const expected = process.env.MKT_HUB_API_TOKEN;
  if (!expected) return false;

  const authHeader = req.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(authHeader);
  const provided = match ? match[1] : "";

  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  const providedHash = crypto.createHash("sha256").update(provided).digest();

  return crypto.timingSafeEqual(expectedHash, providedHash);
}

/**
 * Estado de negócio exposto pro MKT Hub — reconstruído combinando duas fontes:
 *  - "agendado": a task ainda existe no ClickUp (não importa o status cru dela lá dentro
 *    — não temos permissão pra criar um status novo tipo "cancelado" na lista House
 *    Quatro5, então TODA task viva é "agendado" do ponto de vista do MKT Hub).
 *  - "cancelado": a task foi excluída de verdade pelo painel Master. Como o ClickUp não
 *    guarda mais nada sobre ela, isso vem de uma lista à parte no Vercel Edge Config
 *    (ver lib/mktHubTombstones.ts), com retenção rolante de 60 dias.
 */
export type EstadoCaptacao = "agendado" | "cancelado";

/** Extrai `Local: <valor>` da primeira linha correspondente da descrição, ou null. */
export function parseLocalFromDescription(description: string | undefined): string | null {
  if (!description) return null;
  const m = /^Local: (.+)$/m.exec(description);
  return m ? m[1].trim() : null;
}

// Regex "rede de segurança" pra qualquer coisa que pareça telefone dentro do texto do
// briefing, mesmo que a extração abaixo já não devesse incluir a linha de WhatsApp
// (que vem de uma seção anterior da descrição).
const PHONE_LIKE_RE = /\+?\d[\d\s()\-]{7,}\d/g;
const WHATSAPP_SOLICITANTE_LINE_RE = /^.*WhatsApp do solicitante:.*$/gim;

/**
 * Extrai o texto entre a linha "Briefing:" e o que vier primeiro entre: a próxima linha
 * em branco seguida de "Roteiro:", ou o marcador de sincronização do Google Calendar
 * (`GOOGLE_CALENDAR.syncedMarkerPrefix`, gravado por `syncSingleTask` em lib/sync.ts,
 * anexado ao FINAL da descrição depois da task já existir — sem essa segunda checagem,
 * uma captação sem roteiro pronto vazava "Sincronizado no Google Agenda (event: ...)"
 * dentro do briefing exposto pro MKT Hub). Depois remove qualquer linha de WhatsApp do
 * solicitante e redige sequências que pareçam telefone, como rede de segurança extra —
 * esse campo nunca deve vazar telefone pro MKT Hub.
 */
export function parseBriefingFromDescription(description: string | undefined): string {
  if (!description) return "";

  const briefingIdx = description.indexOf("Briefing:");
  if (briefingIdx === -1) return "";

  let rest = description.slice(briefingIdx + "Briefing:".length);

  const roteiroMatch = /\n\s*\n\s*Roteiro:/.exec(rest);
  const syncMarkerIdx = rest.indexOf(GOOGLE_CALENDAR.syncedMarkerPrefix);

  const cutCandidates = [roteiroMatch?.index, syncMarkerIdx === -1 ? undefined : syncMarkerIdx].filter(
    (i): i is number => i !== undefined
  );
  if (cutCandidates.length > 0) {
    rest = rest.slice(0, Math.min(...cutCandidates));
  }

  let briefing = rest.replace(/^\n+/, "").replace(/\n+$/, "");
  briefing = briefing.replace(WHATSAPP_SOLICITANTE_LINE_RE, "").replace(PHONE_LIKE_RE, "[redigido]");
  // Limpa linhas em branco extras deixadas pela remoção acima.
  briefing = briefing
    .split("\n")
    .filter((line, idx, arr) => line.trim() !== "" || (idx > 0 && arr[idx - 1].trim() !== ""))
    .join("\n")
    .trim();

  return briefing;
}

/**
 * Objeto de empresa/marca cru — exatamente como está no custom field "Empresa" do
 * ClickUp, sem NENHUMA tradução pro lado do MKT Hub (não existe mapeamento de
 * companyId de terceiro; isso já existiu numa versão anterior dessa integração e foi
 * removido a pedido explícito — o MKT Hub trata a tradução do lado dele).
 */
export interface EmpresaOrigem {
  option_id: string;
  label: string;
}

export interface MktHubCaptacaoAgendada {
  id: string;
  estado: "agendado";
  /** Status cru do ClickUp (ex: "pendente ", com o espaço — não normalizamos). */
  status_origem: string;
  inicio: string;
  /**
   * `resolveEventWindow` (lib/eventWindow.ts), no estado atual do código, SEMPRE resolve
   * start+end juntos (devolve os dois, ou `null` pro par inteiro quando a task não tem
   * nem start_date nem due_date) — não existe hoje nenhum caminho real de "início
   * resolvido, fim não resolvido" dentro dessa função. Ainda assim o tipo aqui é
   * `string | null` (em vez de sempre `string`) pra já suportar corretamente esse cenário
   * se `resolveEventWindow` um dia passar a devolver os dois de forma independente, sem
   * quebrar contrato com o MKT Hub. Hoje, na prática, toda captação com `estado:
   * "agendado"` tem `fim` preenchido — se aparecer `null`, é porque a lógica de
   * `resolveEventWindow` mudou e precisa ser revisitada aqui também.
   */
  fim: string | null;
  /** Data da captação (AAAA-MM-DD), em America/Fortaleza, derivada de `inicio`. */
  data: string;
  turno: import("./config").Periodo;
  local: string | null;
  empresa_origem: EmpresaOrigem | null;
  quem_grava: { nome: string; clickup_user_id: number; email: string | null }[];
  // Não existe hoje nenhum jeito de recuperar foto/vídeo/ambos a partir da task de
  // captação já criada — o form só usa esse dado internamente pra decidir quais tasks de
  // EDIÇÃO criar (ver createEdicaoTask em lib/clickup.ts), sem gravar isso na própria
  // task de captação (nem custom field, nem linha na descrição). Limitação conhecida, não
  // um bug: sempre null até esse dado virar persistido em algum lugar recuperável.
  tipo_captacao: null;
  titulo: string;
  briefing: string;
  criado_em: string;
  atualizado_em: string;
}

/**
 * "Retrato" de uma captação viva no momento em que ela é cancelada (excluída de verdade
 * no ClickUp) — tudo de MktHubCaptacaoAgendada exceto os campos que são recalculados na
 * hora da leitura de um tombstone (`mapCancelamentoToMktHubCaptacao`): `id` (usamos o
 * `taskId` do próprio tombstone como fonte da verdade), `estado`/`status_origem` (sempre
 * "cancelado"/"deletado" pra quem veio de tombstone) e `atualizado_em` (o momento real do
 * cancelamento, não o `atualizado_em` antigo de quando a task ainda estava viva).
 *
 * Guardado dentro de `CancelamentoEntry.snapshot` (lib/mktHubTombstones.ts) pra uma
 * captação cancelada não voltar pro MKT Hub com todo o contexto perdido (local, briefing,
 * empresa, etc. todos `null`) só porque a task já não existe mais no ClickUp.
 */
export type MktHubCaptacaoSnapshot = Omit<
  MktHubCaptacaoAgendada,
  "id" | "estado" | "status_origem" | "atualizado_em"
>;

/** Extrai de uma captação viva só os campos de "retrato" (ver MktHubCaptacaoSnapshot), pro
 * tombstone guardar como snapshot congelado no exato momento do cancelamento. */
export function toMktHubSnapshot(captacao: MktHubCaptacaoAgendada): MktHubCaptacaoSnapshot {
  return {
    inicio: captacao.inicio,
    fim: captacao.fim,
    data: captacao.data,
    turno: captacao.turno,
    local: captacao.local,
    empresa_origem: captacao.empresa_origem,
    quem_grava: captacao.quem_grava,
    tipo_captacao: captacao.tipo_captacao,
    titulo: captacao.titulo,
    briefing: captacao.briefing,
    criado_em: captacao.criado_em,
  };
}

/**
 * Objeto devolvido pra uma captação cancelada (excluída de verdade no ClickUp, cuja
 * exclusão foi registrada em lib/mktHubTombstones.ts). Estruturalmente é o mesmo "retrato"
 * de uma captação agendada (`MktHubCaptacaoSnapshot`), só que com cada campo também
 * aceitando `null` — porque tombstones antigos (gravados antes do snapshot existir) ou o
 * caso de borda em que `mapTaskToMktHubCaptacao` não conseguiu resolver a janela do evento
 * no momento do cancelamento não têm esse retrato disponível, e caem no fallback "tudo
 * null" de antes. `id` continua sempre `string` (é o `taskId` do tombstone, sempre
 * conhecido), diferente dos outros campos.
 *
 * Optou-se por manter dois tipos (`Agendada`/`Cancelada`) em vez de um único tipo com
 * `estado` discriminando campos opcionais, porque `Agendada` tem garantias reais de
 * não-nulidade (ex.: `titulo`/`briefing` sempre presentes numa task viva) que `Cancelada`
 * não pode ter (pode ou não ter snapshot) — misturar os dois enfraqueceria o tipo mais
 * forte sem necessidade.
 */
export type MktHubCaptacaoCancelada = {
  [K in keyof MktHubCaptacaoSnapshot]: MktHubCaptacaoSnapshot[K] | null;
} & {
  id: string;
  estado: "cancelado";
  status_origem: "deletado";
  atualizado_em: string;
};

export type MktHubCaptacao = MktHubCaptacaoAgendada | MktHubCaptacaoCancelada;

/**
 * Converte uma ClickUpTask (já filtrada como Captação) pro formato exposto pelo MKT Hub.
 * Retorna `null` quando a janela de evento não é resolvível (nem start/due_date, nem
 * due_date sozinho) — situação rara/inesperada numa task de captação real, tratada como
 * "não expõe" em vez de inventar horário.
 */
export function mapTaskToMktHubCaptacao(task: ClickUpTask): MktHubCaptacaoAgendada | null {
  const window = resolveEventWindow(task);
  if (!window) return null;

  const empresaValue = getCustomFieldValue(task, CUSTOM_FIELDS.empresa);
  const empresaUuid = Array.isArray(empresaValue) ? (empresaValue[0] as string | undefined) ?? null : null;
  const empresaLabel = empresaUuid ? UUID_TO_LABEL[empresaUuid] ?? null : null;
  const empresaOrigem: EmpresaOrigem | null =
    empresaUuid && empresaLabel ? { option_id: empresaUuid, label: empresaLabel } : null;

  const quemGrava = (task.assignees ?? []).map((a) => ({
    nome: a.username,
    clickup_user_id: a.id,
    email: a.email ?? null,
  }));

  const inicioParts = toFortalezaParts(window.start);
  const data = `${inicioParts.year}-${String(inicioParts.month + 1).padStart(2, "0")}-${String(
    inicioParts.day
  ).padStart(2, "0")}`;

  return {
    id: task.id,
    estado: "agendado",
    status_origem: task.status.status,
    inicio: toFortalezaIso(window.start),
    fim: toFortalezaIso(window.end),
    data,
    turno: periodoFromHour(inicioParts.hour),
    local: parseLocalFromDescription(task.description),
    empresa_origem: empresaOrigem,
    quem_grava: quemGrava,
    tipo_captacao: null,
    titulo: task.name,
    briefing: parseBriefingFromDescription(task.description),
    criado_em: toFortalezaIso(new Date(Number(task.date_created))),
    atualizado_em: toFortalezaIso(new Date(Number(task.date_updated))),
  };
}

/**
 * Converte uma entrada de cancelamento (lib/mktHubTombstones.ts) pro formato MKT Hub.
 *
 * Se `entry.snapshot` existir (tombstones gravados a partir desse ajuste), devolve o
 * retrato completo da captação como ela era pouco antes de ser cancelada, só trocando
 * `estado`/`status_origem` (sempre "cancelado"/"deletado" aqui) e `atualizado_em` — que é
 * o horário real do cancelamento (`canceladoEm`), o momento real da última mudança de
 * estado desse registro, não o `atualizado_em` antigo de quando a task ainda existia.
 *
 * Se `entry.snapshot` NÃO existir — tombstone antigo, gravado antes desse campo existir
 * (não deveria sobrar nenhum real hoje, mas tratamos defensivamente), ou o caso de borda
 * em que `mapTaskToMktHubCaptacao` não conseguiu resolver a janela do evento no momento do
 * cancelamento — cai no comportamento antigo: todos os outros campos `null`.
 */
export function mapCancelamentoToMktHubCaptacao(entry: {
  taskId: string;
  canceladoEm: string;
  snapshot?: MktHubCaptacaoSnapshot;
}): MktHubCaptacaoCancelada {
  const base = entry.snapshot ?? {
    inicio: null,
    fim: null,
    data: null,
    turno: null,
    local: null,
    empresa_origem: null,
    quem_grava: null,
    tipo_captacao: null,
    titulo: null,
    briefing: null,
    criado_em: null,
  };

  return {
    ...base,
    id: entry.taskId,
    estado: "cancelado",
    status_origem: "deletado",
    atualizado_em: entry.canceladoEm,
  };
}

export function isCaptacaoTask(task: ClickUpTask): boolean {
  const value = getCustomFieldValue(task, CUSTOM_FIELDS.tarefasSkill);
  // valor é array de uuids (campo tipo "labels")
  return Array.isArray(value) && value.includes(FIXED_FIELD_VALUES.tarefasSkillCaptacao);
}
