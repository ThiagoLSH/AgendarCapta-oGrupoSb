// Suporte à integração de leitura pro MKT Hub 2 (/api/integrations/mkt-hub/*).
// Fase 1 de uma integração mão única: nós só expomos dados, nunca recebemos escrita daqui.
// Qualquer mudança de escrita/webhook receptor é fora de escopo desse arquivo de propósito.

import crypto from "crypto";
import { NextRequest } from "next/server";
import { ClickUpTask, getCustomFieldValue } from "./clickup";
import {
  CUSTOM_FIELDS,
  FIXED_FIELD_VALUES,
  SUBMARCA_UUID_TO_MKT_HUB_COMPANY_ID,
  SUBMARCAS_BY_MARCA,
} from "./config";
import { resolveEventWindow } from "./eventWindow";
import { toFortalezaIso } from "./timezone";

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
 * Normaliza o `type` nativo do status do ClickUp (open/unstarted/custom/done/closed) num
 * enum de negócio estável. NÃO existe hoje nenhum status de cancelamento na lista "House
 * Quatro5" — se um dia criarem um (ex: "cancelado"), o ClickUp provavelmente vai atribuir
 * `type: "closed"` a ele também (mesmo type do fluxo de conclusão normal), o que geraria
 * ambiguidade com tasks realmente concluídas. Se isso acontecer, esse mapeamento precisa
 * ser revisitado (provavelmente distinguindo pelo nome do status também, não só pelo type).
 */
export type EstadoCaptacao = "em_andamento" | "concluido";

export function normalizeEstado(statusType: string | undefined): EstadoCaptacao {
  switch (statusType) {
    case "done":
    case "closed":
      return "concluido";
    case "open":
    case "unstarted":
    case "custom":
    default:
      return "em_andamento";
  }
}

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
 * Extrai o texto entre a linha "Briefing:" e a próxima linha em branco seguida de
 * "Roteiro:" (ou o fim da descrição). Depois remove qualquer linha de WhatsApp do
 * solicitante e redige sequências que pareçam telefone, como rede de segurança extra —
 * esse campo nunca deve vazar telefone pro MKT Hub.
 */
export function parseBriefingFromDescription(description: string | undefined): string {
  if (!description) return "";

  const briefingIdx = description.indexOf("Briefing:");
  if (briefingIdx === -1) return "";

  let rest = description.slice(briefingIdx + "Briefing:".length);
  // Corta no primeiro "\n\nRoteiro:" (linha em branco seguida de Roteiro:), se existir.
  const roteiroMatch = /\n\s*\n\s*Roteiro:/.exec(rest);
  if (roteiroMatch) {
    rest = rest.slice(0, roteiroMatch.index);
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

export interface MktHubCaptacao {
  id: string;
  estado: EstadoCaptacao;
  estado_bruto_clickup: string;
  inicio: string;
  fim: string;
  local: string | null;
  marca: { valor_clickup: string | null; slug_mkt_hub: string | null };
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
 * Converte uma ClickUpTask (já filtrada como Captação) pro formato exposto pelo MKT Hub.
 * Retorna `null` quando a janela de evento não é resolvível (nem start/due_date, nem
 * due_date sozinho) — situação rara/inesperada numa task de captação real, tratada como
 * "não expõe" em vez de inventar horário.
 */
export function mapTaskToMktHubCaptacao(task: ClickUpTask): MktHubCaptacao | null {
  const window = resolveEventWindow(task);
  if (!window) return null;

  const empresaValue = getCustomFieldValue(task, CUSTOM_FIELDS.empresa);
  const empresaUuid = Array.isArray(empresaValue) ? (empresaValue[0] as string | undefined) ?? null : null;
  const valorClickup = empresaUuid ? UUID_TO_LABEL[empresaUuid] ?? null : null;
  const slugMktHub = empresaUuid ? SUBMARCA_UUID_TO_MKT_HUB_COMPANY_ID[empresaUuid] ?? null : null;

  const quemGrava = (task.assignees ?? []).map((a) => ({
    nome: a.username,
    clickup_user_id: a.id,
    email: a.email ?? null,
  }));

  return {
    id: task.id,
    estado: normalizeEstado(task.status.type),
    estado_bruto_clickup: task.status.status,
    inicio: toFortalezaIso(window.start),
    fim: toFortalezaIso(window.end),
    local: parseLocalFromDescription(task.description),
    marca: { valor_clickup: valorClickup, slug_mkt_hub: slugMktHub },
    quem_grava: quemGrava,
    tipo_captacao: null,
    titulo: task.name,
    briefing: parseBriefingFromDescription(task.description),
    criado_em: toFortalezaIso(new Date(Number(task.date_created))),
    atualizado_em: toFortalezaIso(new Date(Number(task.date_updated))),
  };
}

export function isCaptacaoTask(task: ClickUpTask): boolean {
  const value = getCustomFieldValue(task, CUSTOM_FIELDS.tarefasSkill);
  // valor é array de uuids (campo tipo "labels")
  return Array.isArray(value) && value.includes(FIXED_FIELD_VALUES.tarefasSkillCaptacao);
}
