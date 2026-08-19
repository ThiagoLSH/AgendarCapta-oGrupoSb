import { MESES_PT, Marca, periodoFromHour } from "./config";
import { toFortalezaParts } from "./timezone";

export interface TaskNameInput {
  marca: Marca;
  titulo: string;
  /** Instante absoluto de início — os componentes de data/hora são extraídos no fuso de Fortaleza. */
  inicio: Date;
}

/**
 * Monta o nome da task no padrão:
 * "[CAPTAÇÃO] <Marca> - <Título> [DD MÊS] - [Período]"
 * A marca é omitida do nome quando for "Outro".
 * Extrai dia/hora sempre no fuso de Fortaleza, nunca no fuso do servidor.
 */
export function buildTaskName({ marca, titulo, inicio }: TaskNameInput): string {
  const { day, month, hour } = toFortalezaParts(inicio);
  const dia = String(day).padStart(2, "0");
  const mes = MESES_PT[month];
  const periodo = periodoFromHour(hour);

  const marcaPrefix = marca === "Outro" ? "" : `${marca} - `;

  return `[CAPTAÇÃO] ${marcaPrefix}${titulo} [${dia} ${mes}] - [${periodo}]`;
}

/**
 * Monta o nome da task de roteiro pro Zion, quando quem marcou a captação não tem
 * roteiro pronto: "[ROTEIRO] <Marca> - <Título da captação>".
 */
export function buildRoteiroTaskName({ marca, titulo }: { marca: Marca; titulo: string }): string {
  const marcaPrefix = marca === "Outro" ? "" : `${marca} - `;
  return `[ROTEIRO] ${marcaPrefix}${titulo}`;
}

const LIMITE_TRECHO_BRIEFING = 300;

/**
 * Extrai um trecho curto e legível do briefing pra usar no título das tasks de edição.
 * - Troca quebras de linha internas por espaço (só depois de já ter localizado o corte por \n no texto original).
 * - Corta no primeiro `.`, `!`, `?` ou `\n` encontrado no texto original.
 * - Se o resultado passar de ~300 caracteres, corta na última palavra inteira dentro do limite e acrescenta "...".
 * - Retorna string vazia se o briefing for vazio ou só espaço em branco.
 */
export function extrairTrechoBriefing(texto: string): string {
  if (!texto || !texto.trim()) return "";

  const corteMatch = texto.match(/[.!?\n]/);
  const bruto = corteMatch ? texto.slice(0, corteMatch.index) : texto;

  const trecho = bruto.replace(/\s*\n\s*/g, " ").trim();
  if (!trecho) return "";

  if (trecho.length <= LIMITE_TRECHO_BRIEFING) return trecho;

  const cortado = trecho.slice(0, LIMITE_TRECHO_BRIEFING);
  const ultimoEspaco = cortado.lastIndexOf(" ");
  const semUltimaPalavraParcial = ultimoEspaco > 0 ? cortado.slice(0, ultimoEspaco) : cortado;
  return `${semUltimaPalavraParcial.trim()}...`;
}

/**
 * Monta o nome das tasks de edição (foto/vídeo), acrescentando ao final um trecho do
 * briefing pra dar contexto real do que precisa ser editado.
 */
export function buildEdicaoTaskName({
  tituloBase,
  briefing,
}: {
  tituloBase: string;
  briefing: string;
}): string {
  const trecho = extrairTrechoBriefing(briefing);
  return trecho ? `${tituloBase} - ${trecho}` : tituloBase;
}

/** Extrai o período do dia a partir do nome de uma task antiga, quando não há hora real disponível. */
export function guessPeriodoFromTaskName(name: string): "Manhã" | "Tarde" | "Noite" | null {
  const match = name.match(/\[(Manhã|Tarde|Noite)\]\s*$/i);
  if (!match) return null;
  const value = match[1];
  if (/manhã/i.test(value)) return "Manhã";
  if (/tarde/i.test(value)) return "Tarde";
  if (/noite/i.test(value)) return "Noite";
  return null;
}

export const PERIODO_HORA_PADRAO: Record<"Manhã" | "Tarde" | "Noite", number> = {
  "Manhã": 9,
  Tarde: 14,
  Noite: 19,
};
