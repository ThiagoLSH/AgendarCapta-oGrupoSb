export const SESSION_COOKIE_NAME = "sb_agenda_session";

export interface Manager {
  name: string;
  password: string;
}

/**
 * Gestores com acesso à visualização do calendário geral, configurados via
 * APP_MANAGERS (JSON): [{"name":"Gustavo","password":"..."}, ...]. Cada um tem login
 * individual (nome + senha própria), mas todos veem o mesmo calendário completo.
 */
export function getManagers(): Manager[] {
  const raw = process.env.APP_MANAGERS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is Manager => typeof m?.name === "string" && typeof m?.password === "string"
    );
  } catch {
    return [];
  }
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Valor do cookie de sessão: hash de nome+senha do gestor, nunca a senha em texto puro. */
export async function computeSessionToken(name: string, password: string): Promise<string> {
  return sha256Hex(`sb-agenda-captacao:${name.trim().toLowerCase()}:${password}`);
}

function encodeSessionCookie(name: string, token: string): string {
  return Buffer.from(JSON.stringify({ name, token }), "utf8").toString("base64url");
}

function decodeSessionCookie(cookieValue: string): { name: string; token: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cookieValue, "base64url").toString("utf8"));
    if (typeof parsed?.name === "string" && typeof parsed?.token === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Verifica nome+senha contra a lista de gestores; retorna o cookie de sessão pronto se válido. */
export async function verifyLoginAndBuildCookie(
  name: string,
  password: string
): Promise<string | null> {
  const manager = getManagers().find((m) => m.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (!manager || manager.password !== password) return null;

  const token = await computeSessionToken(manager.name, password);
  return encodeSessionCookie(manager.name, token);
}

/** Retorna o nome do gestor autenticado, ou null se a sessão for inválida/expirada. */
export async function getValidSessionManagerName(
  cookieValue: string | undefined
): Promise<string | null> {
  if (!cookieValue) return null;
  const decoded = decodeSessionCookie(cookieValue);
  if (!decoded) return null;

  const manager = getManagers().find(
    (m) => m.name.trim().toLowerCase() === decoded.name.trim().toLowerCase()
  );
  if (!manager) return null;

  const expected = await computeSessionToken(manager.name, manager.password);
  return expected === decoded.token ? manager.name : null;
}

export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  return (await getValidSessionManagerName(cookieValue)) !== null;
}
