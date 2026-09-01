// "Tombstones" de cancelamento pra integração MKT Hub 2.
//
// Não temos permissão pra criar um status novo (ex: "cancelado") na lista House Quatro5
// do ClickUp — quando uma captação é excluída de verdade (painel Master), a task some do
// ClickUp e não sobra nenhum jeito de recuperar esse histórico por lá. Pra ainda assim o
// MKT Hub conseguir saber "essa captação que eu vi antes foi cancelada" (em vez de
// simplesmente sumir sem explicação da listagem), guardamos uma lista independente de
// cancelamentos no Vercel Edge Config — mesmo mecanismo usado por lib/auth.ts pra
// gestores (chave "managers"), mas numa chave PRÓPRIA ("mkt_hub_cancelamentos") pra não
// pisar naquela lista.
//
// Retenção rolante de 60 dias: entradas mais antigas que isso são podadas a cada escrita,
// pra não crescer pra sempre. Depois de podada, o MKT Hub simplesmente não vê mais aquele
// ID em nenhuma das duas fontes (nem ClickUp, nem essa lista) — tratado como 404 comum,
// não é bug.

import { get } from "@vercel/edge-config";
import { toFortalezaIso } from "./timezone";

const EDGE_CONFIG_KEY = "mkt_hub_cancelamentos";
const RETENCAO_MS = 60 * 24 * 60 * 60 * 1000; // 60 dias

export interface CancelamentoEntry {
  taskId: string;
  canceladoEm: string; // ISO-8601 com offset -03:00 (toFortalezaIso)
}

interface CancelamentosPayload {
  cancelamentos: CancelamentoEntry[];
}

function isValidEntry(entry: unknown): entry is CancelamentoEntry {
  return (
    !!entry &&
    typeof (entry as CancelamentoEntry).taskId === "string" &&
    typeof (entry as CancelamentoEntry).canceladoEm === "string"
  );
}

/** Lê a lista atual de cancelamentos do Edge Config (chave "mkt_hub_cancelamentos"). */
export async function getCancelamentos(): Promise<CancelamentoEntry[]> {
  try {
    const payload = await get<CancelamentosPayload>(EDGE_CONFIG_KEY);
    if (!payload || !Array.isArray(payload.cancelamentos)) return [];
    return payload.cancelamentos.filter(isValidEntry);
  } catch {
    return [];
  }
}

/** Sobrescreve a lista inteira de cancelamentos no Edge Config via API da Vercel. */
async function saveCancelamentos(cancelamentos: CancelamentoEntry[]): Promise<void> {
  const edgeConfigId = process.env.EDGE_CONFIG_ID;
  const token = process.env.VERCEL_API_TOKEN;
  if (!edgeConfigId || !token) {
    throw new Error("EDGE_CONFIG_ID ou VERCEL_API_TOKEN não configurados no servidor.");
  }

  const payload: CancelamentosPayload = { cancelamentos };

  const res = await fetch(`https://api.vercel.com/v1/edge-config/${edgeConfigId}/items`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ operation: "upsert", key: EDGE_CONFIG_KEY, value: payload }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Falha ao salvar cancelamentos no Edge Config (${res.status}): ${body}`);
  }
}

/**
 * Registra o cancelamento (exclusão real) de `taskId`: lê a lista atual, poda entradas com
 * mais de 60 dias, adiciona a nova entrada com o horário atual (Fortaleza) e salva de
 * volta. Chame ANTES de apagar a task de verdade no ClickUp, mas não deixe uma falha aqui
 * bloquear a exclusão real — a mesma filosofia de "falha de sync não trava o fluxo
 * principal" usada no sync do Google Calendar.
 */
export async function registrarCancelamento(taskId: string): Promise<void> {
  const atual = await getCancelamentos();
  const corte = Date.now() - RETENCAO_MS;
  const podada = atual.filter((entry) => {
    const timestamp = new Date(entry.canceladoEm).getTime();
    return Number.isFinite(timestamp) && timestamp >= corte;
  });

  const novaEntrada: CancelamentoEntry = {
    taskId,
    canceladoEm: toFortalezaIso(new Date()),
  };

  await saveCancelamentos([...podada, novaEntrada]);
}
