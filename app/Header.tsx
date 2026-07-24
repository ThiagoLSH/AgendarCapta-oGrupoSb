"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import LogoutButton from "./LogoutButton";

export default function Header() {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const [managerName, setManagerName] = useState<string | null>(null);

  useEffect(() => {
    if (isLoginPage) return;
    fetch("/api/session")
      .then((res) => res.json())
      .then((data) => setManagerName(data.authenticated ? data.name : null))
      .catch(() => setManagerName(null));
  }, [isLoginPage, pathname]);

  return (
    <header className="app-header">
      <h1>Agenda de Captação — Grupo SB</h1>
      {!isLoginPage && (
        <nav>
          <a href="/">Nova captação</a>
          <a href="/calendario">Calendário</a>
          {managerName && (
            <>
              <span style={{ color: "var(--muted)", fontWeight: 400 }}>Olá, {managerName}</span>
              <LogoutButton />
            </>
          )}
        </nav>
      )}
    </header>
  );
}
