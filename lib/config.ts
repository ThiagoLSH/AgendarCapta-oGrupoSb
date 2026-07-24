// Regras de negócio fixas do sistema de agenda de captação (Grupo SB).
// Alterar aqui exige revalidar com o time de marketing (Maria Clara) antes de subir.

export const CLICKUP = {
  listId: "901321051391", // House Quatro5
  folderId: "901313343285", // MKT
  spaceId: "901310318852", // Shared with me (workspace Quatro5)
  workspaceId: "9013450208",
  thiagoUserId: "112066337", // assignee fixo em toda task de captação
  zionUserId: "112066340", // assignee fixo na task de roteiro, quando não tem roteiro pronto
} as const;

export const CUSTOM_FIELDS = {
  empresa: "4edf0f50-f3a4-4666-a8a9-40616038bfe2", // labels — única "Empresa" válida (14 opções, com Weevo)
  tarefasSkill: "036acdcf-df5a-4a6f-a944-3845236cd64a", // labels
  tipoDemanda: "29cf0a36-6192-4ce0-a678-991bc3701269", // dropdown
  pontoAtividadeMkt: "0f939433-f3b1-493c-9212-731c3ad2da15", // number, obrigatório
} as const;

export const FIXED_FIELD_VALUES = {
  tarefasSkillCaptacao: "5f1d6dd8-7738-4754-a0b9-a033b8be380b", // "Captação"
  tipoDemandaCaptacao: "bdf2c0b1-8365-4240-aa91-6de7980ff862", // "Captação"
  tarefasSkillRoteiro: "fb1323e1-b004-440e-8dcd-1a0493b711b8", // "Roteiro de vídeo"
  tipoDemandaRedacao: "f1bef6de-82d5-41cc-8b56-da1d3e513961", // "Redação"
} as const;

export type Marca = "SeuBoné" | "Carbone" | "Onevo" | "Weevo" | "Outro";

export const MARCAS: Marca[] = ["SeuBoné", "Carbone", "Onevo", "Weevo", "Outro"];

export interface SubMarcaOption {
  label: string;
  uuid: string;
}

// Marca (agenda) -> lista de sub-marcas/"Empresa" disponíveis no ClickUp
export const SUBMARCAS_BY_MARCA: Record<Marca, SubMarcaOption[]> = {
  "SeuBoné": [
    { label: "SeuBoné", uuid: "dc1b693f-af85-4a5f-8ee8-14816c8dab8f" },
    { label: "SB Personalizados", uuid: "167bc5cb-e7df-4fbc-a6bb-fb8631403230" },
    { label: "SB Agro", uuid: "737dede3-61ec-48b8-a593-d7f76fa7c4d1" },
    { label: "SB Térmicos", uuid: "2f0f7f24-42ad-4682-838c-cf29a9b5444b" },
    { label: "SB Bolsas", uuid: "001a02f8-2d11-4e1f-8c31-372887c4233d" },
  ],
  Carbone: [
    { label: "Carbone Educação", uuid: "3162fa47-9c99-44b6-a8a5-b7f9ebd7a6eb" },
    { label: "Carbone Club", uuid: "89a0befe-b005-4fd8-9359-bc452d105f04" },
  ],
  Onevo: [
    { label: "Onevo Investimentos", uuid: "f37e7cc9-34d5-4c10-b86e-a9db4f165d5f" },
    { label: "Onevo Energia", uuid: "744cc953-db85-4730-b7dc-cb243dbad256" },
  ],
  Weevo: [{ label: "Weevo", uuid: "43f458e4-737b-423b-ad4b-da88a0d4d701" }],
  Outro: [
    { label: "Quatro5", uuid: "8382554f-f71f-4256-befc-6920562a3086" },
    { label: "Box Corporativo", uuid: "9020a82f-4844-4abf-8ae2-cba8c2b72047" },
    { label: "Time SB", uuid: "77f13a56-39bc-4501-9611-8862c861b36d" },
    { label: "Time Onevo", uuid: "f51d9659-91c3-4ec6-965b-0f6ce58ab642" },
  ],
};

// Cor do evento no Google Calendar por marca (colorId da API)
export const GCAL_COLOR_BY_MARCA: Partial<Record<Marca, string>> = {
  Onevo: "9",
  Carbone: "3",
  Weevo: "10",
  "SeuBoné": "5",
  // "Outro" -> sem colorId (default do calendário)
};

export const GOOGLE_CALENDAR = {
  captacaoCalendarId:
    "300de111734357d92bf31cae28f0b656f8a06c6b7f19675d823db4135a185b87@group.calendar.google.com",
  timezone: "America/Fortaleza",
  syncedMarkerPrefix: "Sincronizado no Google Agenda", // + ID do evento, gravado na descrição da task
} as const;

export const MESES_PT: string[] = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
];

export type Periodo = "Manhã" | "Tarde" | "Noite";

/** Deriva o período do dia a partir da hora de início (0-23). */
export function periodoFromHour(hour: number): Periodo {
  if (hour < 12) return "Manhã";
  if (hour < 18) return "Tarde";
  return "Noite";
}

/**
 * Pontuação do campo "Ponto de atividade MKT" com base na duração (em horas).
 * Acima de 4h não há tabela oficial ainda — usamos 12 como teto provisório
 * e sinalizamos que precisa ser confirmado com a Maria Clara.
 */
export function pontosFromDuracaoHoras(horas: number): {
  pontos: number;
  precisaConfirmar: boolean;
} {
  if (horas <= 1) return { pontos: 3, precisaConfirmar: false };
  if (horas <= 2) return { pontos: 6, precisaConfirmar: false };
  if (horas <= 4) return { pontos: 12, precisaConfirmar: false };
  return { pontos: 12, precisaConfirmar: true };
}
