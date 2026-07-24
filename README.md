# Agenda de Captação — Grupo SB

Aplicação web (Next.js) que substitui o protótipo do Cowork: cria e visualiza tasks de
captação de conteúdo na lista ClickUp "House Quatro5" e replica os eventos para o
calendário Google dedicado "Captação — Grupo SB", acessível por qualquer pessoa fora do
ClickUp (comercial, sócios) via link público.

## Estrutura

- `lib/config.ts` — todas as regras de negócio fixas (IDs do ClickUp, mapeamento marca →
  sub-marca/UUID, tabela de pontos, cores por marca no Google Calendar).
- `lib/naming.ts` — monta o nome da task no padrão `[CAPTAÇÃO] <Marca> - <Título> [DD MÊS] - [Período]`.
- `lib/clickup.ts` — client da API REST do ClickUp (criar/listar tasks, custom fields).
- `lib/googleCalendar.ts` — client da Google Calendar API (service account) para o
  calendário dedicado. Nunca toca no calendário pessoal do Thiago.
- `lib/sync.ts` — lógica de sincronização: varre a lista, ignora tasks já marcadas com
  "Sincronizado no Google Agenda" na descrição, cria o evento e grava o marcador.
- `app/page.tsx` (rota `/`) — formulário de criação de captação, página inicial do site.
  Aberto pra qualquer um com o link (sem senha) — só pede o nome da pessoa antes, pra
  preencher o campo "Solicitante" (guardado no navegador via `localStorage`, não precisa
  digitar de novo). Título, marca, data/horário, local, solicitante, quem será captado e
  briefing são obrigatórios. Se "já tem o roteiro pronto?" for "Não", cria automaticamente
  uma task de roteiro pro Zion (assignee fixo) com o briefing, e marca a captação como
  dependente dela (`depends_on`) no ClickUp.
- `app/api/captacoes/[taskId]/anexo` — recebe o roteiro em PDF (multipart) e anexa na
  task de captação já criada via API do ClickUp.
- `app/calendario/page.tsx` (rota `/calendario`) — calendário mensal colorido por marca.
  Protegido por senha de gestor — só pede a senha quando alguém clica em "Calendário".
- `app/nova-captacao/page.tsx` — redirect pra `/`, mantido só por compatibilidade com
  links antigos já compartilhados.
- `app/login/page.tsx` — tela de login (nome + senha individual, sem cadastro) só pra ver
  o calendário geral. Todo gestor vê o mesmo calendário completo (todas as marcas) — o
  login individual é só pra controle de quem acessou, não filtra por marca.
- `app/api/managers` — lista só os nomes dos gestores (nunca as senhas), pra popular o
  seletor da tela de login.
- `app/admin/page.tsx` (rota `/admin`) — painel exclusivo do role "master": adicionar/
  remover gestor, e excluir uma captação por completo (ClickUp + evento no Google
  Calendar). `middleware.ts` bloqueia essa rota (e `/api/admin/*`) pra quem não é master.
- `middleware.ts` — protege `/calendario` e `/api/tasks` (qualquer gestor) e `/admin` +
  `/api/admin/*` (só role "master"). Sem sessão válida, redireciona para `/login` ou
  responde 401/403. Tudo o mais (marcar captação, `/api/sync`) fica aberto.
- `lib/auth.ts` — lê/grava a lista de gestores no Vercel Edge Config (não numa env var —
  o painel Master precisa adicionar/remover gestor em tempo real, sem redeploy) e gera/
  valida o cookie de sessão (hash de nome+senha, nunca a senha em texto puro).
- `app/api/captacoes` — cria a task no ClickUp com os 4 custom fields corretos.
- `app/api/tasks` — lista as captações para o calendário.
- `app/api/sync` — endpoint chamado pelo cron para rodar a sincronização.
- `scripts/sync.ts` — mesma sincronização via CLI (`npm run sync:once`), útil se o cron
  rodar fora da Vercel (ex: GitHub Actions, cron do próprio servidor).

## Configuração

1. Copie `.env.example` para `.env.local` e preencha:
   - `CLICKUP_API_TOKEN`: gerado em ClickUp > Configurações > Apps.
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: crie uma
     service account no Google Cloud Console, ative a Calendar API, gere uma chave JSON
     e **compartilhe o calendário dedicado com o e-mail da service account** (permissão
     "Fazer alterações nos eventos").
   - `CRON_SECRET`: qualquer string aleatória, usada para proteger `/api/sync`.
   - `EDGE_CONFIG` / `EDGE_CONFIG_ID` / `VERCEL_API_TOKEN`: guardam a lista de gestores
     (nome, senha, role). Crie um Edge Config (`vercel edge-config add <slug>`), gere um
     read token (`vercel edge-config tokens <id> --add <label>`) e monte a connection
     string `https://edge-config.vercel.com/<id>?token=<token>` pro `EDGE_CONFIG`. O
     `VERCEL_API_TOKEN` é um token pessoal (vercel.com/account/tokens) usado só pra
     escrever quando o painel Master adiciona/remove um gestor.
   - Popule o item inicial `managers` no Edge Config com pelo menos um role "master":
     `vercel edge-config update <id> --patch '{"items":[{"operation":"upsert","key":"managers","value":[{"name":"Fulano","password":"...","role":"master"}]}]}'`.
     Quem só vai marcar uma captação não precisa de nada disso, o formulário fica aberto.
     Trocar/remover a senha de alguém invalida só a sessão dela.
2. `npm install`
3. `npm run dev` e acesse `http://localhost:3000`.

## Sincronização periódica

- Este projeto está no plano **Hobby** da Vercel, onde cron nativo só roda 1x/dia. O
  `vercel.json` já agenda `/api/sync` uma vez por dia (12:00 UTC) como rede de segurança,
  mas a sincronização de verdade (a cada 15-30min) deve rodar por um cron externo
  gratuito, ex: **cron-job.org**:
  1. Crie uma conta em cron-job.org.
  2. Novo cronjob → URL: `https://<seu-domínio-vercel>/api/sync`.
  3. Intervalo: a cada 15-30min.
  4. Em "Advanced" → Headers, adicione `Authorization: Bearer <valor do CRON_SECRET>`.
- Se migrar para o plano Pro no futuro, é só trocar o `schedule` do `vercel.json` para
  `*/15 * * * *` e o cron nativo assume sozinho.
- Alternativa sem Vercel: rodar `npm run sync:once` via cron do próprio servidor/Railway.

## Pendências conhecidas (ver contexto completo no prompt original)

- Pontuação para captações acima de 4h ainda não tem tabela oficial — confirmar com a
  Maria Clara antes de confiar no valor provisório (12 pontos) gerado pelo sistema.
- O marcador de sincronização é gravado como texto na descrição da task porque a API
  usada no protótipo não permitia criar tags novas via MCP. Com o token de API direto
  (`CLICKUP_API_TOKEN`), é possível reavaliar criar uma tag real `gcal-sincronizado` via
  `POST /api/v2/space/{space_id}/tag` antes de aplicá-la à task — mais limpo que o texto.
- Hospedagem: este projeto está pronto para Vercel, mas roda em qualquer host Node
  (Railway, Render). Ajustar `vercel.json` (cron) se migrar de provedor.
