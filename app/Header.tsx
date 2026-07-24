"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import LogoutButton from "./LogoutButton";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const [session, setSession] = useState<{ name: string; role: string } | null>(null);

  useEffect(() => {
    if (isLoginPage) return;
    fetch("/api/session")
      .then((res) => res.json())
      .then((data) => setSession(data.authenticated ? { name: data.name, role: data.role } : null))
      .catch(() => setSession(null));
  }, [isLoginPage, pathname]);

  return (
    <header className="app-header">
      <div className="brand">
        <h1>Agenda de Captação</h1>
        <span className="brand-tag">Grupo SB</span>
      </div>
      {!isLoginPage && (
        <nav>
          <a href="/" className={pathname === "/" ? "active" : ""}>
            Nova captação
          </a>
          <a href="/calendario" className={pathname === "/calendario" ? "active" : ""}>
            Calendário
          </a>
          {session?.role === "master" && (
            <a href="/admin" className={pathname === "/admin" ? "active" : ""}>
              Admin
            </a>
          )}
          {session && (
            <span className="session-info">
              <span>
                Olá, <strong style={{ color: "var(--text)", fontWeight: 600 }}>{session.name}</strong>
              </span>
              <LogoutButton />
            </span>
          )}
          <ThemeToggle />
        </nav>
      )}
    </header>
  );
}
