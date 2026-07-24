"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import LogoutButton from "./LogoutButton";

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
      <h1>Agenda de Captação — Grupo SB</h1>
      {!isLoginPage && (
        <nav>
          <a href="/">Nova captação</a>
          <a href="/calendario">Calendário</a>
          {session?.role === "master" && <a href="/admin">Admin</a>}
          {session && (
            <>
              <span style={{ color: "var(--muted)", fontWeight: 400 }}>Olá, {session.name}</span>
              <LogoutButton />
            </>
          )}
        </nav>
      )}
    </header>
  );
}
