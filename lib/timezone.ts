// America/Fortaleza é sempre UTC-3, sem horário de verão (Brasil aboliu DST em 2019).
// Por isso um offset fixo é seguro — não precisa de biblioteca de timezone.
const FORTALEZA_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Converte data/hora informados como horário local de Fortaleza (o que o usuário digita
 * no formulário) pro instante UTC absoluto correspondente — independente do fuso horário
 * onde o processo Node está rodando (em produção na Vercel é UTC, localmente pode ser
 * outro). Usar `new Date(year, month, day, hour, minute)` diretamente quebra isso, porque
 * esse construtor interpreta os valores no fuso do processo, não em Fortaleza.
 */
export function fortalezaToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0) + FORTALEZA_UTC_OFFSET_MS);
}

export interface FortalezaParts {
  year: number;
  /** 0-indexado, igual ao retorno de Date.getMonth() */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/**
 * Extrai os componentes de data/hora no fuso de Fortaleza a partir de um instante
 * absoluto, sem depender do fuso do servidor (usa sempre os getters UTC, com o offset
 * fixo já aplicado).
 */
export function toFortalezaParts(date: Date): FortalezaParts {
  const shifted = new Date(date.getTime() - FORTALEZA_UTC_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** Constrói um instante UTC a partir de um Date de referência (fuso Fortaleza) trocando só a hora/minuto. */
export function withFortalezaTime(date: Date, hour: number, minute: number): Date {
  const parts = toFortalezaParts(date);
  return fortalezaToUtc(parts.year, parts.month + 1, parts.day, hour, minute);
}

/**
 * Formata um instante absoluto como ISO-8601 com o offset explícito de Fortaleza
 * (-03:00), nunca "Z" nem sem offset — usado nas respostas da integração externa
 * (MKT Hub) pra evitar qualquer ambiguidade de fuso no consumidor.
 */
export function toFortalezaIso(date: Date): string {
  const shifted = new Date(date.getTime() - FORTALEZA_UTC_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}-03:00`
  );
}
