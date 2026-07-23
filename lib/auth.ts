export const SESSION_COOKIE_NAME = "sb_agenda_session";

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Valor do cookie de sessão: hash da senha compartilhada, nunca a senha em texto puro. */
export async function computeSessionToken(password: string): Promise<string> {
  return sha256Hex(`sb-agenda-captacao:${password}`);
}

export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword || !cookieValue) return false;
  const expected = await computeSessionToken(appPassword);
  return expected === cookieValue;
}
