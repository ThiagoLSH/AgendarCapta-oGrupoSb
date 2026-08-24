/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // O service worker (public/sw.js) precisa ser sempre revalidado com o
        // servidor a cada requisição. Sem isso, o navegador pode ficar até 24h
        // (limite do spec de Service Workers) usando uma cópia em cache do
        // arquivo antes de checar se existe uma versão nova — o que atrasaria
        // tanto uma atualização normal de cache (ver VERSIONAMENTO DO CACHE no
        // topo de public/sw.js) quanto, de forma crítica, o KILL SWITCH: se
        // algo der errado em produção e for preciso desativar o SW rápido, essa
        // regra garante que o navegador não fique servindo uma cópia velha do
        // arquivo por horas. Regra isolada e explícita, separada de qualquer
        // cache longo que ícones/assets estáticos do public/ possam receber
        // (seja do Next, seja da CDN da hospedagem).
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
    ];
  },
};

module.exports = nextConfig;
