"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [names, setNames] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/managers")
      .then((res) => res.json())
      .then((data) => {
        setNames(data.names ?? []);
        if (data.names?.length) setName(data.names[0]);
      })
      .catch(() => setNames([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Erro ao entrar");

      const next = searchParams.get("next") || "/calendario";
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card card-narrow">
      <div className="accent-tick" />
      <h2>Entrar</h2>
      <p className="subtitle">Acesso restrito à visualização do calendário geral, para gestores.</p>
      <form onSubmit={handleSubmit}>
        <div className="field-group">
          <label>Gestor</label>
          <select value={name} onChange={(e) => setName(e.target.value)} required>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label>Senha</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Sua senha individual"
            autoFocus
            required
          />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? "Entrando…" : "Entrar"}
        </button>
        {error && <div className="status-message error">{error}</div>}
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
