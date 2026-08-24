/**
 * Service worker do Agenda de Captação — Grupo SB.
 *
 * ESTRATÉGIA DE CACHE (resumo, ver detalhes abaixo):
 *   - NUNCA cacheia: qualquer rota /api/* e qualquer navegação de página HTML
 *     (document). Esses dados sempre têm que vir frescos do ClickUp/Google
 *     Calendar/sessão — cachear isso quebraria o app (dados velhos, sessão
 *     expirada parecendo válida, etc).
 *   - CACHE-FIRST só pra assets estáticos imutáveis (_next/static/*, os ícones
 *     do PWA, favicon/apple-icon, fontes) — esses têm hash de build no nome ou
 *     não mudam, então servir do cache primeiro é seguro e rápido.
 *   - Tudo o que não cair explicitamente numa dessas duas regras passa direto
 *     pro navegador decidir (comportamento padrão, sem respondWith).
 *
 * VERSIONAMENTO DO CACHE:
 *   O nome do cache inclui a versão do app (vem do package.json, injetada pelo
 *   RegisterServiceWorker.tsx como query string "?v=" na URL de registro). A
 *   cada novo deploy com bump de versão, o cache antigo passa a ter nome
 *   diferente do CACHE_NAME calculado agora, e o passo "activate" abaixo apaga
 *   qualquer cache do app que não seja o atual. skipWaiting()+clients.claim()
 *   garantem que a versão nova assume na hora, sem precisar fechar todas as
 *   abas.
 *
 * KILL SWITCH — como desativar rapidamente em produção se algo der errado:
 *   1. Troque a constante KILL_SWITCH abaixo de `false` para `true`.
 *   2. Dê deploy normal (git commit + push / deploy Vercel).
 *   3. Quando o navegador do usuário buscar o sw.js atualizado (isso acontece
 *      sozinho em navegações subsequentes, o browser confere byte-a-byte o
 *      arquivo; se quiser forçar mais rápido, oriente um refresh manual), o
 *      novo service worker: para de interceptar/cachear qualquer coisa nova,
 *      apaga TODOS os caches que este app criou, e se desregistra
 *      (unregister()) sozinho — depois disso o navegador volta a se comportar
 *      100% como um site normal, sem service worker nenhum.
 *   4. Não precisa reverter nenhum outro código do app pra isso ter efeito.
 */

const KILL_SWITCH = false;

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_NAME = `agenda-captacao-static-${VERSION}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      if (KILL_SWITCH) {
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
        await self.clients.claim();
        await self.registration.unregister();
        return;
      }

      // Apaga qualquer cache de versão antiga deste app (qualquer nome que não
      // seja o cache da versão atual).
      await Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

function isStaticImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/icon-192.png" ||
    url.pathname === "/icon-512.png" ||
    url.pathname === "/icon-512-maskable.png" ||
    url.pathname === "/apple-icon.png" ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/favicon.ico" ||
    url.pathname.startsWith("/fonts/")
  );
}

self.addEventListener("fetch", (event) => {
  if (KILL_SWITCH) return; // deixa o navegador cuidar de tudo, sem interceptar nada

  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // não intercepta terceiros (fontes do Google, etc.)

  // NETWORK-ONLY, explícito: rotas de API e navegação de páginas HTML nunca são
  // cacheadas. Não chamar respondWith() aqui equivale a deixar passar pra rede
  // normalmente, mas deixamos explícito com "return" pra documentar a intenção.
  const isApi = url.pathname.startsWith("/api/");
  const isNavigation = request.mode === "navigate";
  if (isApi || isNavigation) {
    return;
  }

  // CACHE-FIRST só pros assets estáticos imutáveis.
  if (isStaticImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        try {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(request);
          if (cached) return cached;
          const response = await fetch(request);
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        } catch (err) {
          // Cache Storage indisponível (raro, mas observado em alguns navegadores/perfis)
          // ou falha de rede ao tentar popular o cache: cai pra um fetch direto como
          // última alternativa antes de propagar o erro. Isso evita que uma falha na
          // camada de cache derrube o carregamento de um asset que a rede serviria bem.
          return fetch(request);
        }
      })()
    );
    return;
  }

  // Qualquer outra coisa: comportamento padrão do navegador (sem cache).
});
