import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "./Header";
import ThemeScript from "./ThemeScript";
import RegisterServiceWorker from "./RegisterServiceWorker";

export const metadata: Metadata = {
  title: "Agenda de Captação — Grupo SB",
  description: "Agenda de captação de conteúdo para SeuBoné, Carbone, Onevo e Weevo",
  manifest: "/manifest.json",
};

// Tema dark-first (ver app/globals.css :root); cor usada pela UI do navegador/PWA
// na status bar / barra de tarefas ao instalar o app. Não confundir com o toggle
// claro/escuro em localStorage — isso aqui é só o "chrome" do navegador/OS.
export const viewport: Viewport = {
  themeColor: "#0e0e12",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <ThemeScript />
        {/* Next 14 não gera essas duas automaticamente a partir da metadata API padrão;
            adicionadas manualmente pra habilitar modo "standalone" no iOS ao instalar
            via "Adicionar à Tela de Início". apple-touch-icon já é gerado sozinho pela
            convenção de arquivo app/apple-icon.png, não duplicar aqui. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>
        <div className="app-shell">
          <Header />
          <main>{children}</main>
        </div>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
