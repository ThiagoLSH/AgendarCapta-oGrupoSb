"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import LogoutButton from "./LogoutButton";

export default function Header() {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    if (isLoginPage) return;
    fetch("/api/session")
      .then((res) => res.json())
      .then((data) => setIsManager(!!data.authenticated))
      .catch(() => setIsManager(false));
  }, [isLoginPage, pathname]);

  return (
    <header className="app-header">
      <h1>Agenda de Captação — Grupo SB</h1>
      {!isLoginPage && (
        <nav>
          {isManager && <a href="/">Calendário</a>}
          <a href="/nova-captacao">Nova captação</a>
          {isManager && <LogoutButton />}
        </nav>
      )}
    </header>
  );
}
