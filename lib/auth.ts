import { get } from "@vercel/edge-config";

export const SESSION_COOKIE_NAME = "sb_agenda_session";

export type ManagerRole = "gestor" | "master";

export interface Manager {
  name: string;
  password: string;
  role: ManagerRole;
}

/**
 * Gestores com acesso à visualização do calendário geral, guardados no Edge Config
 * (chave "managers") — não numa env var, porque o painel Master precisa conseguir
 * adicionar/remover gestor em tempo real, sem redeploy. Todo gestor vê o mesmo
 * calendário completo; só o role "master" tem acesso ao painel de administração.
 */
export async function getManagers(): Promise<Manager[]> {
  try {
    const managers = await get<Manager[]>("managers");
    if (!Array.isArray(managers)) return [];
    return managers.filter(
      (m): m is Manager =>
        typeof m?.name === "string" && typeof m?.password === "string" && typeof m?.role === "string"
    );
  } catch {
    return [];
  }
}

/** Sobrescreve a lista inteira de gestores no Edge Config via API da Vercel. */
export async function saveManagers(managers: Manager[]): Promise<void> {
  const edgeConfigId = process.env.EDGE_CONFIG_ID;
  const token = process.env.VERCEL_API_TOKEN;
  if (!edgeConfigId || !token) {
    throw new Error("EDGE_CONFIG_ID ou VERCEL_API_TOKEN não configurados no servidor.");
  }

  const res = await fetch(`https://api.vercel.com/v1/edge-config/${edgeConfigId}/items`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{ operation: "upsert", key: "managers", value: managers }] }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Falha ao salvar gestores no Edge Config (${res.status}): ${body}`);
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
  const managers = await getManagers();
  const manager = managers.find((m) => m.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (!manager || manager.password !== password) return null;

  const token = await computeSessionToken(manager.name, password);
  return encodeSessionCookie(manager.name, token);
}

export interface SessionInfo {
  name: string;
  role: ManagerRole;
}

/** Retorna nome+role do gestor autenticado, ou null se a sessão for inválida/expirada. */
export async function getValidSession(cookieValue: string | undefined): Promise<SessionInfo | null> {
  if (!cookieValue) return null;
  const decoded = decodeSessionCookie(cookieValue);
  if (!decoded) return null;

  const managers = await getManagers();
  const manager = managers.find(
    (m) => m.name.trim().toLowerCase() === decoded.name.trim().toLowerCase()
  );
  if (!manager) return null;

  const expected = await computeSessionToken(manager.name, manager.password);
  return expected === decoded.token ? { name: manager.name, role: manager.role } : null;
}

export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  return (await getValidSession(cookieValue)) !== null;
}
