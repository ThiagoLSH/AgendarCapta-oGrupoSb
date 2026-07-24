"use client";

import { useEffect, useState } from "react";

interface ManagerRow {
  name: string;
  role: "gestor" | "master";
}

interface CaptacaoEvent {
  id: string;
  name: string;
  url: string;
  start: number;
  marca: string | null;
  status: string;
}

const MARCA_COLOR_VAR: Record<string, string> = {
  "SeuBoné": "--marca-seubone",
  Carbone: "--marca-carbone",
  Onevo: "--marca-onevo",
  Weevo: "--marca-weevo",
  Outro: "--marca-outro",
};

export default function AdminPage() {
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [managersError, setManagersError] = useState<string | null>(null);

  const [novoNome, setNovoNome] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [novoRole, setNovoRole] = useState<"gestor" | "master">("gestor");
  const [addingManager, setAddingManager] = useState(false);

  const [captacoes, setCaptacoes] = useState<CaptacaoEvent[]>([]);
  const [captacoesLoading, setCaptacoesLoading] = useState(true);
  const [captacoesError, setCaptacoesError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function loadManagers() {
    fetch("/api/admin/managers")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setManagers(data.managers);
        setManagersError(null);
      })
      .catch((err) => setManagersError(err instanceof Error ? err.message : String(err)));
  }

  function loadCaptacoes() {
    setCaptacoesLoading(true);
    fetch("/api/tasks")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setCaptacoes(data.events.sort((a: CaptacaoEvent, b: CaptacaoEvent) => b.start - a.start));
        setCaptacoesError(null);
      })
      .catch((err) => setCaptacoesError(err instanceof Error ? err.message : String(err)))
      .finally(() => setCaptacoesLoading(false));
  }

  useEffect(() => {
    loadManagers();
    loadCaptacoes();
  }, []);

  async function handleAddManager(e: React.FormEvent) {
    e.preventDefault();
    setAddingManager(true);
    setManagersError(null);
    try {
      const res = await fetch("/api/admin/managers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: novoNome, password: novaSenha, role: novoRole }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Erro ao adicionar gestor");
      setNovoNome("");
      setNovaSenha("");
      setNovoRole("gestor");
      loadManagers();
    } catch (err) {
      setManagersError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingManager(false);
    }
  }

  async function handleRemoveManager(name: string) {
    if (!confirm(`Remover o gestor "${name}"? A sessão dele(a) será invalidada.`)) return;
    setManagersError(null);
    try {
      const res = await fetch("/api/admin/managers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Erro ao remover gestor");
      loadManagers();
    } catch (err) {
      setManagersError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDeleteCaptacao(taskId: string, name: string) {
    if (!confirm(`Excluir a captação "${name}"? Isso apaga a task no ClickUp e o evento no Google Calendar. Não tem como desfazer.`)) {
      return;
    }
    setDeletingId(taskId);
    setCaptacoesError(null);
    try {
      const res = await fetch(`/api/admin/captacoes/${taskId}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Erro ao excluir captação");
      setCaptacoes((prev) => prev.filter((c) => c.id !== taskId));
    } catch (err) {
      setCaptacoesError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 34 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h2 style={{ margin: 0 }}>Painel Master</h2>
        <span className="badge-header">Acesso total</span>
      </div>

      <section>
        <h3 style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 12 }}>
          Gestores
        </h3>
        {managersError && <div className="status-message error">{managersError}</div>}
        <div className="row-list" style={{ marginBottom: 18 }}>
          {managers.map((m) => (
            <div key={m.name} className="row-item">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600 }}>
                {m.name}
                <span className={m.role === "master" ? "badge badge-master" : "badge badge-gestor"}>
                  {m.role === "master" ? "Master" : "Gestor"}
                </span>
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleRemoveManager(m.name)}>
                Remover
              </button>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", margin: "0 0 14px" }}>
            Adicionar gestor
          </p>
          <form
            onSubmit={handleAddManager}
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}
          >
            <div>
              <label>Nome</label>
              <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} required />
            </div>
            <div>
              <label>Senha</label>
              <input value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} required />
            </div>
            <div>
              <label>Papel</label>
              <select value={novoRole} onChange={(e) => setNovoRole(e.target.value as "gestor" | "master")}>
                <option value="gestor">Gestor</option>
                <option value="master">Master</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={addingManager}>
              {addingManager ? "Adicionando…" : "Adicionar"}
            </button>
          </form>
        </div>
      </section>

      <section>
        <h3 style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 12 }}>
          Captações
        </h3>
        {captacoesError && <div className="status-message error">{captacoesError}</div>}
        {captacoesLoading && <p>Carregando captações…</p>}
        <div className="row-list">
          {captacoes.map((c) => {
            const cssVar = c.marca ? MARCA_COLOR_VAR[c.marca] : "--marca-outro";
            return (
              <div key={c.id} className="row-item">
                <div className="row-main">
                  <span className="row-bar" style={{ background: `var(${cssVar})` }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="row-name">{c.name}</div>
                    <div className="row-meta">
                      {new Date(c.start).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} ·{" "}
                      {c.status}{" "}
                      <a href={c.url} target="_blank" rel="noreferrer">
                        ver no ClickUp
                      </a>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDeleteCaptacao(c.id, c.name)}
                  disabled={deletingId === c.id}
                  style={{ flexShrink: 0 }}
                >
                  {deletingId === c.id ? "Excluindo…" : "Excluir"}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
