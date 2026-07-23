import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agenda de Captação — Grupo SB",
  description: "Agenda de captação de conteúdo para SeuBoné, Carbone, Onevo e Weevo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="app-shell">
          <header className="app-header">
            <h1>Agenda de Captação — Grupo SB</h1>
            <nav>
              <a href="/">Calendário</a>
              <a href="/nova-captacao">Nova captação</a>
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
