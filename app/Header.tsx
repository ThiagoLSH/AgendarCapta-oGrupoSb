"use client";

import { usePathname } from "next/navigation";
import LogoutButton from "./LogoutButton";

export default function Header() {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  return (
    <header className="app-header">
      <h1>Agenda de Captação — Grupo SB</h1>
      {!isLoginPage && (
        <nav>
          <a href="/">Calendário</a>
          <a href="/nova-captacao">Nova captação</a>
          <LogoutButton />
        </nav>
      )}
    </header>
  );
}
