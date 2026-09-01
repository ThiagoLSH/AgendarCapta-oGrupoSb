# Agenda de Captação — Grupo SB

Contexto completo do sistema para o Claude. Ler antes de mexer no projeto.

## O que é

App web (Next.js) que centraliza o agendamento de **captações** (gravações de foto/vídeo) do time de marketing do Grupo SB (marcas: SeuBoné, Carbone, Onevo, Weevo, entre outras). Qualquer pessoa (sem login) marca uma captação pelo link público; o sistema:

- Cria a task no ClickUp (lista "House Quatro5", pasta "MKT")
- Espelha o evento num Google Calendar dedicado ("Captação — Grupo SB"), visível a quem não tem acesso ao ClickUp (comercial, parceiros)
- Cria automaticamente tasks dependentes: roteiro (se ainda não tiver script pronto) e edição de foto/vídeo (silenciosas, o solicitante nunca vê)
- Alimenta um fluxo separado no **n8n** (self-hosted) que manda confirmação/lembretes por WhatsApp via **UAZAPI**, e trata pedidos de "adiar captação" respondidos pelo captado

Não existe banco de dados: **ClickUp é a fonte da verdade**, Google Calendar é espelho, Vercel Edge Config guarda os gestores (managers) e os tombstones de cancelamento pro MKT Hub, e uma Google Sheet guarda o estado de contatos/log do fluxo de WhatsApp.

## Stack

- Next.js 14.2.35 (App Router), React 18.3.1, TypeScript 5.5.3
- Hospedagem: Vercel (plano Hobby) — cron diário em `vercel.json`; um cron externo (cron-job.org) chama `/api/sync` a cada 15–30 min pro sync de verdade
- `googleapis` — cliente do Google Calendar (auth via service account)
- `@vercel/edge-config` — lista de gestores (nome/senha/role) sem precisar redeploy
- Sem NextAuth — auth própria via cookie de sessão (hash de nome+senha)
- CSS puro, tema dark-first com toggle claro persistido em localStorage; responsivo (mobile/tablet) via media queries aditivas
- PWA instalável: `public/manifest.json` + `public/sw.js` (service worker escrito à mão, cache versionado por `package.json`, kill switch documentado no topo do arquivo)
- `scripts/sync.ts` + `npm run sync:once` — roda o mesmo sync fora do cron da Vercel (ex.: GitHub Actions/Railway)

## Estrutura de pastas

```
lib/
  config.ts          IDs fixos do ClickUp, UUIDs de custom fields, mapa marca→sub-marca, tabela de pontos, cores do GCal por marca
  clickup.ts         cliente REST do ClickUp (create/list/link/dependency/comment/anexo/delete)
  googleCalendar.ts  cliente do Google Calendar (service account), só a calendar "Captação — Grupo SB"
  sync.ts            syncSingleTask() (sync imediato) + syncCaptacoesToGoogleCalendar() (varredura completa)
  eventWindow.ts     resolve a janela do evento quando a task só tem due_date (sem start_date)
  naming.ts          monta os nomes das tasks: "[CAPTAÇÃO] Marca - Título [DD MÊS] - Período", "[ROTEIRO] ..."
  timezone.ts        conversão explícita America/Fortaleza <-> UTC (Vercel roda em UTC)
  auth.ts            sessão via cookie (hash nome+senha), lê/escreve gestores no Vercel Edge Config
  formOptions.ts     opções de prioridade/cor de marca, compartilhadas entre form principal e modal do calendário
  conflict.ts        checagem de sobreposição de horário entre captações (global, todas as marcas)
  mktHubIntegration.ts  auth bearer, parsing/mapeamento pro payload da integração MKT Hub 2
  mktHubTombstones.ts   lista de cancelamentos (tombstones) no Vercel Edge Config, retenção 60 dias

app/
  page.tsx                    "/" — form público (sem login) de nova captação
  calendario/page.tsx          "/calendario" — calendário mensal, cor por marca, exige login de gestor
  calendario/CaptacaoModal.tsx form de criação ao clicar num dia do calendário
  admin/page.tsx                "/admin" — painel Master: add/remove gestores, apagar captação
  login/page.tsx                login por nome+senha (individual por gestor)
  nova-captacao/page.tsx        redirect legado para "/"
  api/captacoes/route.ts        POST — cria task no ClickUp (+ roteiro/edição) e sincroniza no GCal
  api/captacoes/[taskId]/anexo/route.ts  upload de PDF de roteiro
  api/tasks/route.ts             GET — lista captações pro calendário (protegido)
  api/sync/route.ts              GET/POST — sync completo, protegido por CRON_SECRET (bearer)
  api/login|logout|session/route.ts
  api/managers/route.ts          expõe só os nomes dos gestores (nunca senha)
  api/admin/captacoes/[taskId]/route.ts  DELETE — remove task ClickUp + evento GCal + registra tombstone
  api/admin/managers/route.ts    CRUD de gestores via Vercel Edge Config (só Master)
  api/integrations/mkt-hub/captacoes/route.ts       GET — listagem paginada pro MKT Hub 2 (bearer próprio)
  api/integrations/mkt-hub/captacoes/[id]/route.ts  GET — unitário por ID, cobre também cancelados

n8n/                            automação separada (self-hosted), só mensageria
  README-n8n.md
  workflow-a-lembretes-whatsapp.json   "SB Captação — Confirmação e Lembretes WhatsApp"
  workflow-b-resposta-adiamento.json  "SB Captação — Recebimento e Adiamento"
```

## ClickUp

- Lista `901321051391` ("House Quatro5"), pasta `901313343285` ("MKT"), workspace `9013450208`
- Responsáveis fixos: Thiago (`112066337`, captação + edição de foto), Zion (`112066340`, roteiro), Klenio (`112066326`, edição de vídeo)
- Toda task nova entra com status **`"pendente "`** (nota: espaço no final — precisa bater exatamente com o status da lista), não o default "solicitado form"
- Custom fields relevantes (UUIDs em `lib/config.ts`):
  - `empresa` — marca/sub-marca (14 opções, inclusive Weevo)
  - `tarefasSkill` — Captação / Roteiro de vídeo / Edição de vídeo / Edição de foto
  - `tipoDemanda` — Captação / Redação / Edição
  - `pontoAtividadeMkt` — pontos calculados pela duração
  - `telefoneCaptado` ("Whatsapp Captado", UUID `ec822183-...`) — preenchido pelo form, consumido pelo n8n
  - `estagioLembrete` ("Estágio do lembrete", UUID `d898626d-...`) — contador 0–4 usado só pelo n8n (0=nenhum, 1=confirmação, 2=lembrete 1 dia, 3=2h, 4=30min)
  - Telefone do solicitante **não** é custom field — vai como linha no corpo da descrição (`WhatsApp do solicitante: ...`), extraído por regex no workflow B
- Relações: captação → roteiro via `depends_on` (bloqueante); captação → edição via `link` (não bloqueante) + comentário anunciando a task de edição
- Pontuação (`pontosFromDuracaoHoras`): ≤1h=3, ≤2h=6, ≤4h=12, >4h=12 mas marcado `precisaConfirmar: true` (tabela acima de 4h ainda não fechada — pendente confirmação da Maria Clara). Edição sempre `PONTOS_EDICAO_BASE = 3`.
- Sync com o Google Calendar é marcado por **texto** na descrição (`Sincronizado no Google Agenda (event: <id>)`), não por tag real do ClickUp — limitação conhecida, considerar migrar para uma tag `gcal-sincronizado` real.

## Google Calendar

- Calendar dedicado (não é o pessoal do Thiago): `300de111734357d92bf31cae28f0b656f8a06c6b7f19675d823db4135a185b87@group.calendar.google.com`, timezone `America/Fortaleza`
- Auth via service account (`GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`), compartilhado com edição para essa service account
- Cor do evento por marca (colorId): Onevo=9, Carbone=3, Weevo=10, SeuBoné=5, "Outro"=sem cor
- Sync roda duas vezes: imediato no submit (`syncSingleTask`) e periódico via `/api/sync` (cron diário da Vercel como rede de segurança + cron externo a cada 15–30min pro ritmo real)

## n8n + WhatsApp (UAZAPI) + Google Sheets

Automação separada do app Next.js, só toca nos custom fields do ClickUp e no telefone embutido na descrição.

**Workflow A — Confirmação e Lembretes WhatsApp** (a cada 15 min):
1. Busca captações abertas no ClickUp (filtro server-side `tarefasSkill = Captação`)
2. Cruza com a aba "Contatos de Captação" da planilha
3. Decide, por task, se é hora de mandar: confirmação (0→1), lembrete de 1 dia (→2, ≤24h), 2h (→3), 30min (→4) — controlado pelo contador `estagioLembrete`, evitando reenvio; pula tasks sem telefone ou que já começaram há mais de 15min
4. Se for o primeiro contato, manda mensagem de apresentação antes
5. Envia via UAZAPI `POST /send/text`
6. Loga tudo na aba "Log" da planilha, atualiza o contador no ClickUp e a aba "Contatos de Captação"
7. Todo nó HTTP/Sheets usa `continueRegularOutput` pra uma falha não travar as outras tasks

**Workflow B — Recebimento e Adiamento** (webhook UAZAPI):
1. Recebe mensagem inbound, normaliza payload (formato ainda **não confirmado 100%** — testar ao vivo antes de ativar)
2. Só segue se o texto for "Adiar captação" (case-insensitive) e não for mensagem do próprio bot
3. Busca no ClickUp a task mais próxima cujo telefone bate com `telefoneCaptado`
4. Se faltar ≥1h pro horário: pede nova data/horário em até 7 dias, comenta no ClickUp
5. Se faltar <1h: avisa que não dá pra remarcar automaticamente, sinaliza 🚨 pra tratativa manual
6. Notifica Thiago, Maria Clara e o solicitante (se telefone constar na descrição) via UAZAPI; loga na planilha

**Google Sheets** ("Contatos de Captação — Agenda SB", id `1tYkmBMk2A6Gpw6rJtCpT_bQeC-k2X1QtNVivJf0VkmU`), compartilhada com a mesma service account do Calendar (`agenda-captacao-sync@grupo-sb-agenda.iam.gserviceaccount.com`):
- Aba "Contatos de Captação": Telefone, Nome, Já Recebeu Apresentação, Data da Primeira Captação
- Aba "Log": Timestamp, Telefone, Tipo, Mensagem, TaskId, Status

## Fluxo ponta a ponta

1. Usuário abre `/` (sem login) → preenche form (título, marca/sub-marca, data/hora local Fortaleza, local, solicitante, captado + telefones opcionais, briefing, roteiro pronto ou não, tipo foto/vídeo/ambos, prioridade)
2. `POST /api/captacoes` valida, converte horário local→UTC (`lib/timezone.ts`), calcula pontos, monta nome da task, cria no ClickUp com status "pendente " e Thiago como responsável
3. Sem roteiro pronto → cria task de roteiro pro Zion, `depends_on` bloqueante
4. Sempre, silenciosamente → cria task(s) de edição (vídeo→Klenio, foto→Thiago), linkadas (não bloqueante) + comentário
5. Chama `syncSingleTask()` na hora pra criar o evento no Google Calendar; falha aqui não derruba o request (o cron/externo tenta de novo depois)
6. n8n workflow A (a cada 15min) manda confirmação/lembretes por WhatsApp via UAZAPI conforme `estagioLembrete`
7. Se o captado responder "Adiar captação", workflow B trata a remarcação e notifica Thiago/Maria Clara/solicitante

## Controle de acesso (`middleware.ts` + `lib/auth.ts`)

- `/` e `/api/captacoes` — público, sem login (de propósito: qualquer um pode pedir uma captação)
- `/calendario` e `/api/tasks` — exige login de qualquer gestor (cookie de sessão validado contra a lista no Vercel Edge Config)
- `/admin` e `/api/admin/*` — exige role `"master"` (Thiago, Maria Clara)
- `/api/sync` — fora do gate de sessão; protegido por `CRON_SECRET` (bearer token), porque quem chama é um cron externo, não navegador
- `/api/integrations/mkt-hub/*` — fora do gate de sessão, mesmo padrão de `/api/sync`; protegido por `MKT_HUB_API_TOKEN` (bearer, comparação em tempo constante via `crypto.timingSafeEqual`)
- Gestores ficam no **Vercel Edge Config** (não env var) justamente pra dar pra add/remover pelo painel Master sem redeploy

## Integração MKT Hub 2 (leitura, mão única)

Fase 1 apenas: nós expomos, o MKT Hub 2 consome. Sem escrita/webhook receptor nesse repo.

- `GET /api/integrations/mkt-hub/captacoes` (listagem paginada) e `GET /api/integrations/mkt-hub/captacoes/:id` (unitário), autenticados por `Authorization: Bearer <MKT_HUB_API_TOKEN>`
- Query params da listagem: `updated_since` (ISO-8601 com offset, opcional, vira `date_updated_gt` nativo do ClickUp), `page`, `limit` (default 50, máx 100)
- Paginação: busca captações ativas (ClickUp) e cancelamentos (Edge Config) **separadamente e por completo**, combina num array só, ordena ASCENDENTE por `atualizado_em` (nunca perde item numa sincronização incremental) e só então corta a página — `captacoes.length` nunca excede `limit`, mesmo somando as duas fontes
- **Cancelamento**: não temos permissão pra criar status novo (tipo "Cancelado") na lista House Quatro5. Quando uma captação é excluída de verdade via `/admin`, `registrarCancelamento()` (`lib/mktHubTombstones.ts`) grava `{ taskId, canceladoEm }` numa chave própria do Vercel Edge Config (`mkt_hub_cancelamentos`, não mistura com a chave `managers`), com retenção rolante de 60 dias. Depois de podado, o item simplesmente não existe mais em nenhuma das duas fontes — 404 comum, considerado definitivo
- `estado`: `"agendado"` (task viva no ClickUp, `status_origem` = status cru sem normalizar) ou `"cancelado"` (veio da lista de tombstones, `status_origem: "deletado"`, todos os demais campos `null`)
- `empresa_origem: { option_id, label }` é o valor **cru** do custom field `empresa` — sem nenhuma tradução pro lado do MKT Hub (existiu uma tabela de mapeamento pra companyId numa versão anterior, foi removida a pedido)
- `local` vem de parsing por regex da linha `Local: ...` na descrição (não é custom field) — pode ter ruído ocasional
- `tipo_captacao` é sempre `null` — não há como recuperar foto/vídeo/ambos a partir da task de captação já criada (só influencia quais tasks de edição são criadas, não fica registrado nela)
- `briefing` tem a linha "WhatsApp do solicitante:" e qualquer telefone removidos/redigidos antes de expor, e é cortado também antes do marcador de sync do Google Calendar (que é anexado ao final da descrição depois da task existir)

## Timezone

Toda a lógica de negócio assume `America/Fortaleza`. `lib/timezone.ts` existe só pra evitar o bug clássico de Vercel: o processo Node serverless roda em UTC, então construir `Date` local ingenuamente gerava hora errada tanto no ClickUp quanto no Google Calendar. Corrigido com conversão explícita de offset fixo (`fortalezaToUtc`, `toFortalezaParts`).

## Pendências conhecidas

- Tabela de pontos acima de 4h ainda é provisória (12 pts) — falta confirmação da Maria Clara
- Marcador de sync do GCal é texto na descrição, não tag real do ClickUp (limitação herdada do protótipo original via MCP) — vale revisitar já que agora é API token direto
- Hospedagem é Vercel-ready mas portável pra qualquer host Node (Railway, Render) — só ajustar o cron do `vercel.json`
- Payload do webhook inbound da UAZAPI no workflow B ainda não foi confirmado ao vivo — testar antes de ativar em produção
- `tipo_captacao` na integração MKT Hub é sempre `null` — só vira recuperável se esse dado passar a ser persistido (custom field ou linha na descrição) na criação da task
- Integração MKT Hub é fase 1 (só leitura); fase 2 (escrita/webhook receptor) ainda não tem design definido

## Histórico (evolução, mais antigo → mais recente)

1. Bootstrap do projeto
2. Fix de timeout em `/api/tasks` (filtro server-side por custom field, ~55s → ~4s)
3. Mostrar no calendário tasks só com due_date (sem start_date)
4. Fix de colunas desalinhadas no calendário (CSS)
5. Login com senha compartilhada protegendo o app inteiro (`/api/sync` excluído, autenticado por cron)
6. Restringe a senha só à visualização do calendário (marcar captação vira público)
7. Move calendário pra `/calendario`; `/` vira o form público; `/nova-captacao` como redirect legado
8. Cria evento no Google Calendar na hora do submit (`syncSingleTask()`)
9. Adiciona briefing, roteiro e task automática pro Zion
10. Login individual por gestor (nome+senha) substitui senha única
11. Painel Master (apagar captação, add/remove gestores); gestores migram pra Vercel Edge Config
12. Redesign completo de UI/UX (tema dark-first, wizard de 3 passos, testado com Playwright)
13. Favicon/ícone (claquete)
14. Fix de timezone (`lib/timezone.ts`), task automática de edição, campos de telefone
15. Permite criar captação clicando num dia do calendário (`CaptacaoModal.tsx`)
16. Separa task de edição por tipo (foto/vídeo)
17. Ativa campos de telefone do form + primeira versão dos workflows n8n de WhatsApp
18. Cria a planilha "Contatos de Captação" e liga o ID nos workflows n8n
19. Força toda task nova pro status "pendente " em vez do default da lista
20. Liga de fato os custom fields "Estágio do lembrete" e "Whatsapp Captado" no ClickUp
21. Fix no nó Split Out do n8n que derrubava telefone/taskId ao explodir mensagens (`include: allOtherFields`), causando rejeição da UAZAPI ("Missing required fields")
22. Trava de conflito de horário (`lib/conflict.ts`): sobreposição global entre marcas bloqueada antes de criar a task, com proteção contra corrida (duas requisições simultâneas) e popup de aviso no form/modal
23. Título das tasks de edição ganha um trecho do briefing no final, pra dar contexto real do que precisa ser editado
24. Filtro por marca-mãe no `/calendario` + visualização de horário tipo Google Calendar (mini timeline proporcional dentro de cada dia, substituindo o empilhamento de blocos)
25. Modal de captação (`CaptacaoModal.tsx`) só fecha pelo X, com confirmação de descarte se algo foi alterado — clique fora nunca fecha mais
26. App tornado responsivo (mobile/tablet, grade do calendário mantendo 7 colunas) e instalável como PWA (manifest, ícones, service worker escrito à mão com cache versionado e kill switch documentado)
27. (mais recente) Integração de leitura pro MKT Hub 2 (`/api/integrations/mkt-hub/*`, fase 1 mão única): cancelamento via tombstone no Edge Config (sem permissão pra status novo no ClickUp), paginação combinando captações ativas + canceladas sem nunca exceder `limit`

**Trajetória geral**: começou como sync simples ClickUp↔Calendar, evoluiu a autenticação (senha única → por gestor → por role), passou por um redesign completo de UI, construiu o pipeline de produção "escondido" (roteiro + edição automáticos), debugou a automação de WhatsApp via n8n + UAZAPI + Google Sheets, e mais recentemente evoluiu pra prevenir conflito de agenda, virou responsivo/PWA, e ganhou sua primeira integração externa de leitura (MKT Hub 2).
