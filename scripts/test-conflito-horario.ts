// Teste manual do bloqueio de horários sobrepostos (fix do bug de dupla marcação).
//
// Dispara DUAS requisições POST /api/captacoes quase simultâneas (Promise.all) pro MESMO
// horário, e confirma que só uma sobrevive (201/200) e a outra recebe 409 HORARIO_INDISPONIVEL.
//
// ATENÇÃO: isso cria task(s) DE VERDADE na lista House Quatro5 do ClickUp (e evento no
// Google Calendar, se a que sobreviver sincronizar). Rode só contra um ambiente de teste,
// ou apague manualmente a task sobrevivente depois (painel /admin) se rodar contra produção.
//
// Uso:
//   1. `npm run dev` (ou aponte BASE_URL para um ambiente já no ar)
//   2. `npm run test:conflito` (ou `tsx scripts/test-conflito-horario.ts`)
//
// Variáveis de ambiente opcionais:
//   BASE_URL   default "http://localhost:3000"
//   TEST_DATA  "YYYY-MM-DD" default: amanhã
import "dotenv/config";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

function amanha(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const TEST_DATA = process.env.TEST_DATA ?? amanha();

function buildPayload(sufixo: string) {
  return {
    titulo: `[TESTE CONFLITO] ${sufixo} ${Date.now()}`,
    marca: "SeuBoné",
    submarcaUuid: "dc1b693f-af85-4a5f-8ee8-14816c8dab8f", // SeuBoné
    data: TEST_DATA,
    horaInicio: "10:00",
    horaFim: "12:00",
    local: "Teste automatizado de conflito de horário",
    solicitante: "Script de teste",
    quemSeraCaptado: "Ninguém (teste)",
    briefing: "Requisição gerada por scripts/test-conflito-horario.ts",
    tipoCaptacao: "video",
    roteiroPronto: true,
    roteiroTexto: "N/A — teste automatizado",
    prioridade: "normal",
  };
}

async function postCaptacao(sufixo: string) {
  const res = await fetch(`${BASE_URL}/api/captacoes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildPayload(sufixo)),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  console.log(`Disparando 2 requisições simultâneas para ${TEST_DATA} 10:00-12:00 em ${BASE_URL}/api/captacoes ...`);

  const [a, b] = await Promise.all([postCaptacao("A"), postCaptacao("B")]);

  console.log("\nResultado A:", JSON.stringify(a, null, 2));
  console.log("\nResultado B:", JSON.stringify(b, null, 2));

  const ok = [a, b].filter((r) => r.status >= 200 && r.status < 300);
  const conflitos = [a, b].filter((r) => r.status === 409 && r.body?.error === "HORARIO_INDISPONIVEL");

  console.log(`\nSucessos: ${ok.length} | Conflitos (409): ${conflitos.length}`);

  if (ok.length === 1 && conflitos.length === 1) {
    console.log("✅ PASSOU: só uma das duas requisições criou a task, a outra foi bloqueada com 409.");
    if (ok[0].body?.task?.id) {
      console.log(`Lembre de apagar a task de teste depois (painel /admin): ${ok[0].body.task.id} — ${ok[0].body.task.name ?? ""}`);
    }
  } else if (ok.length === 2) {
    console.error("❌ FALHOU: as duas requisições criaram task — o bloqueio de conflito não funcionou.");
    process.exitCode = 1;
  } else {
    console.error("❌ FALHOU: resultado inesperado (nenhuma criada, ou erro diferente de 409).");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
