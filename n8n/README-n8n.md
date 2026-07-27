# Fluxo n8n — Confirmação e lembrete de captação via WhatsApp

Dois workflows, pra importar no n8n self-hosted:

- `workflow-a-lembretes-whatsapp.json` — roda a cada 15min, manda confirmação e os 3
  lembretes (1 dia / 2h / 30min) pra pessoa que vai ser captada.
- `workflow-b-resposta-adiamento.json` — escuta mensagens recebidas na UAZAPI, trata o
  pedido "Adiar captação".

Não mexe na sincronização ClickUp → Google Agenda que já existe — isso aqui é só
mensageria.

## 1. Campos no ClickUp ✅ já criados e ligados

- **"Estágio do lembrete"** (number) — `d898626d-ae5a-4d4f-89c4-5e75f8a74f1e`. Controla
  o que já foi mandado pra cada captação, pra nunca duplicar:
  - `0` = nada enviado ainda
  - `1` = confirmação enviada
  - `2` = lembrete de 1 dia enviado
  - `3` = lembrete de 2h enviado
  - `4` = lembrete de 30min enviado
  - (esse contador junta a confirmação inicial com os 3 lembretes do pedido original,
    numa sequência só — mais simples de controlar que dois campos separados)
- **"Whatsapp Captado"** (tipo `phone`) — `ec822183-eb29-4434-9dd3-4c36276135ea`. Testado
  de ponta a ponta: o site já grava o telefone nesse campo (`lib/config.ts`, chave
  `telefoneCaptado`) e os dois workflows já apontam pro mesmo UUID.

Os dois UUIDs já estão preenchidos no node **CONFIG** dos dois workflows — não precisa
mexer em nada aqui.

O campo **"WhatsApp do solicitante"** eu decidi resolver como campo do formulário
mesmo (não um cadastro à parte) — já está funcional no site, gravado na *descrição* da
task como `WhatsApp do solicitante: ...`; o workflow B lê essa linha por regex, não
precisa de campo customizado novo pra isso.

## 2. Credenciais pra criar no n8n

- **"ClickUp Token"** — credencial do tipo *Header Auth*, header `Authorization`, valor
  = o mesmo token de `CLICKUP_API_TOKEN` que o site usa.
- **"UAZAPI Token"** — credencial do tipo *Header Auth*, header `token`, valor = o token
  da sua instância UAZAPI.
- **"Google Sheets — Captação"** — credencial OAuth2 padrão do node Google Sheets do
  n8n (fluxo normal de autorizar a conta Google).

Depois de importar os workflows, cada node HTTP Request/Google Sheets vai pedir pra
você selecionar a credencial certa (o JSON só referencia o nome, o segredo não viaja
nele).

## 3. Planilha Google "Contatos de Captação" ✅ já criada

Planilha: [Contatos de Captação — Agenda SB](https://docs.google.com/spreadsheets/d/1tYkmBMk2A6Gpw6rJtCpT_bQeC-k2X1QtNVivJf0VkmU/edit)
— compartilhada com a service account (`agenda-captacao-sync@grupo-sb-agenda.iam.gserviceaccount.com`),
já com as 2 abas e cabeçalhos prontos, e o ID já preenchido em `googleSheetsSpreadsheetId`
nos dois workflows:

- **"Contatos de Captação"** — colunas: `Telefone`, `Nome`, `Já Recebeu Apresentação`
  (`sim`/vazio), `Data da Primeira Captação`. Controla quem já recebeu a mensagem de
  apresentação, pra não repetir.
- **"Log"** — colunas: `Timestamp`, `Telefone`, `Tipo`, `Mensagem`, `TaskId`, `Status`.
  Log de auditoria de toda mensagem mandada (os dois workflows escrevem aqui).

Como a planilha foi compartilhada com a **mesma service account** que já sincroniza o
Google Calendar (em vez de criada por ela — service account avulsa não consegue criar
arquivo próprio no Drive), a credencial do n8n pode reaproveitar esse mesmo par
e-mail/chave: no node Google Sheets, use o método de autenticação **Service Account**
(não OAuth2) com `GOOGLE_SERVICE_ACCOUNT_EMAIL` e `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
(os mesmos valores do `.env.local` do site). Se o n8n de vocês só tiver a opção OAuth2
pro node Google Sheets, aí sim crie uma credencial OAuth2 normal autorizando a conta
Google que já é dona/editora da planilha.

## 4. Valores que só você tem

No node **CONFIG** do workflow B (o A não precisa):

- `telefoneThiago` — seu WhatsApp, formato `55DDNNNNNNNNN`.
- `telefoneMariaClara` — WhatsApp da Maria Clara, mesmo formato.

E nos dois workflows:

- `uazapiBaseUrl` — a URL da sua instância (`https://seudominio.uazapi.com`).

## 5. UAZAPI — confirmar antes de ativar

Endpoints usados (confirmados na documentação pública, mas vale testar 1x manual antes
de ativar de vez):

- Enviar texto: `POST {uazapiBaseUrl}/send/text`, header `token: <token da instância>`,
  body `{"number": "55...", "text": "..."}`.
- Receber mensagem: configure um webhook na UAZAPI (`POST {uazapiBaseUrl}/webhook`,
  action `add`, evento `messages`) apontando pra URL do node **Receber Mensagem UAZAPI**
  do workflow B (o n8n mostra essa URL assim que você importa/salva o workflow).

**Importante**: o formato exato do payload que a UAZAPI manda pro webhook eu não
consegui confirmar 100% nesta sessão (a documentação é renderizada em JS, não abriu
pro meu fetch). O node **"Normalizar Mensagem"** do workflow B já tenta os formatos mais
comuns (`text`, `body`, `message.conversation`, `sender`, `from`, `chatid`...). Antes de
ativar de vez: mande uma mensagem de teste, abra a execução no n8n, veja o `$json.body`
bruto do node do Webhook, e ajusta esse Code node em 2 minutos se os nomes de campo
vierem diferentes.

## 6. O que ainda precisa de ajuste manual no n8n após importar

Nós de `IF` e os seletores de planilha do Google Sheets (`documentId`/`sheetName`) às
vezes precisam ser reconfirmados na interface do n8n depois de um import via JSON puro
(é normal, o n8n costuma preencher sozinho ao reconhecer o node). Antes de ativar,
percorre os dois workflows conferindo se os `IF` mostram as condições certas e se os
dois Google Sheets apontam pra planilha/aba certas.

## 7. Lógica implementada (resumo)

- **Workflow A**: Schedule (15/15min) → busca captações abertas no ClickUp → cruza com
  a planilha de contatos → decide se manda apresentação + confirmação/lembrete →
  manda via UAZAPI → atualiza "Estágio do lembrete" no ClickUp → loga na planilha.
  Cada task processada isoladamente (`onError: continueRegularOutput` nos HTTP/Sheets),
  uma falha não derruba as outras.
- **Workflow B**: Webhook recebe mensagem → filtra só "Adiar captação" (ignora o resto,
  inclusive mensagens enviadas pela própria API) → busca a captação da pessoa no
  ClickUp → calcula se está dentro do prazo de 1h → responde o captado (aceita ou
  recusa) → comenta a task no ClickUp → avisa Thiago + Maria Clara + solicitante (se
  tiver telefone cadastrado) → loga na planilha.
