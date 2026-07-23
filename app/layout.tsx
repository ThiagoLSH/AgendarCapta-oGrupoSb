import type { Metadata } from "next";
import "./globals.css";
import Header from "./Header";

export const metadata: Metadata = {
  title: "Agenda de Captação — Grupo SB",
  description: "Agenda de captação de conteúdo para SeuBoné, Carbone, Onevo e Weevo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="app-shell">
          <Header />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
