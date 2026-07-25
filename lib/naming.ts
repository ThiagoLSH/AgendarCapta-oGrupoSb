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
