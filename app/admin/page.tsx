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
  status: string;
}

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
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <h2>Painel Master</h2>

      <section>
        <h3 style={{ marginBottom: 8 }}>Gestores</h3>
        {managersError && <div className="status-message error">{managersError}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {managers.map((m) => (
            <div
              key={m.name}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "8px 12px",
              }}
            >
              <span>
                {m.name} <span style={{ color: "var(--muted)", fontSize: 12 }}>({m.role})</span>
              </span>
              <button
                type="button"
                onClick={() => handleRemoveManager(m.name)}
                style={{
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "4px 10px",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Remover
              </button>
            </div>
          ))}
        </div>

        <form onSubmit={handleAddManager} style={{ maxWidth: 480 }}>
          <label>
            Nome
            <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} required />
          </label>
          <label>
            Senha
            <input value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} required />
          </label>
          <label>
            Papel
            <select value={novoRole} onChange={(e) => setNovoRole(e.target.value as "gestor" | "master")}>
              <option value="gestor">Gestor (vê o calendário)</option>
              <option value="master">Master (vê o calendário + este painel)</option>
            </select>
          </label>
          <button type="submit" disabled={addingManager}>
            {addingManager ? "Adicionando…" : "Adicionar gestor"}
          </button>
        </form>
      </section>

      <section>
        <h3 style={{ marginBottom: 8 }}>Captações</h3>
        {captacoesError && <div className="status-message error">{captacoesError}</div>}
        {captacoesLoading && <p>Carregando captações…</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {captacoes.map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "8px 12px",
                gap: 12,
              }}
            >
              <a href={c.url} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.name}
                </div>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>
                  {new Date(c.start).toLocaleString("pt-BR")} — {c.status}
                </div>
              </a>
              <button
                type="button"
                onClick={() => handleDeleteCaptacao(c.id, c.name)}
                disabled={deletingId === c.id}
                style={{
                  background: "#a3312c",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 12px",
                  cursor: "pointer",
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                {deletingId === c.id ? "Excluindo…" : "Excluir"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
