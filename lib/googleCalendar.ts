import { google } from "googleapis";
import { GOOGLE_CALENDAR } from "./config";

function getAuth() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Credenciais da service account do Google não configuradas. Defina GOOGLE_SERVICE_ACCOUNT_EMAIL e GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY em .env.local"
    );
  }

  return new google.auth.JWT({
    email: clientEmail,
    // .env guarda a chave com \n escapado; precisa converter de volta para quebras de linha reais.
    key: privateKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
}

function getCalendarClient() {
  return google.calendar({ version: "v3", auth: getAuth() });
}

export interface CreateCaptacaoEventInput {
  summary: string;
  description?: string;
  /** ISO 8601 com offset, já no timezone da agenda */
  startIso: string;
  endIso: string;
  colorId?: string;
}

/** Cria um evento no calendário dedicado "Captação — Grupo SB". Nunca usa o calendário pessoal. */
export async function createCaptacaoEvent(input: CreateCaptacaoEventInput): Promise<string> {
  const calendar = getCalendarClient();

  const res = await calendar.events.insert({
    calendarId: GOOGLE_CALENDAR.captacaoCalendarId,
    requestBody: {
      summary: input.summary,
      description: input.description,
      colorId: input.colorId,
      start: { dateTime: input.startIso, timeZone: GOOGLE_CALENDAR.timezone },
      end: { dateTime: input.endIso, timeZone: GOOGLE_CALENDAR.timezone },
    },
  });

  if (!res.data.id) {
    throw new Error("Google Calendar não retornou um ID de evento ao criar.");
  }

  return res.data.id;
}

export async function deleteCaptacaoEvent(eventId: string): Promise<void> {
  const calendar = getCalendarClient();
  await calendar.events.delete({
    calendarId: GOOGLE_CALENDAR.captacaoCalendarId,
    eventId,
  });
}
