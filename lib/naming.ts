import { MESES_PT, Marca, periodoFromHour } from "./config";

export interface TaskNameInput {
  marca: Marca;
  titulo: string;
  /** Data/hora de início, no fuso local da agenda (America/Fortaleza). */
  inicio: Date;
}

/**
 * Monta o nome da task no padrão:
 * "[CAPTAÇÃO] <Marca> - <Título> [DD MÊS] - [Período]"
 * A marca é omitida do nome quando for "Outro".
 */
export function buildTaskName({ marca, titulo, inicio }: TaskNameInput): string {
  const dia = String(inicio.getDate()).padStart(2, "0");
  const mes = MESES_PT[inicio.getMonth()];
  const periodo = periodoFromHour(inicio.getHours());

  const marcaPrefix = marca === "Outro" ? "" : `${marca} - `;

  return `[CAPTAÇÃO] ${marcaPrefix}${titulo} [${dia} ${mes}] - [${periodo}]`;
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
