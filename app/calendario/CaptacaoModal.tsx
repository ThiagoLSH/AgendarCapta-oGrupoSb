"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MARCAS, SUBMARCAS_BY_MARCA, Marca } from "@/lib/config";
import { MARCA_COLOR, PRIORIDADE, Prioridade } from "@/lib/formOptions";

interface CaptacaoModalProps {
  initialDate: string; // "YYYY-MM-DD"
  onClose: () => void;
  onCreated: () => void;
}

export default function CaptacaoModal({ initialDate, onClose, onCreated }: CaptacaoModalProps) {
  const [titulo, setTitulo] = useState("");
  const [marca, setMarca] = useState<Marca>("SeuBoné");
  const [submarcaUuid, setSubmarcaUuid] = useState(SUBMARCAS_BY_MARCA["SeuBoné"][0].uuid);
  const [data, setData] = useState(initialDate);
  const [horaInicio, setHoraInicio] = useState("09:00");
  const [horaFim, setHoraFim] = useState("11:00");
  const [local, setLocal] = useState("");
  const [solicitante, setSolicitante] = useState("");
  const [quemSeraCaptado, setQuemSeraCaptado] = useState("");
  const [briefing, setBriefing] = useState("");
  const [roteiroPronto, setRoteiroPronto] = useState<"sim" | "nao" | "">("");
  const [roteiroTexto, setRoteiroTexto] = useState("");
  const [prioridade, setPrioridade] = useState<Prioridade>("normal");

  const roteiroFileRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/session")
      .then((res) => res.json())
      .then((sessionData) => {
        if (sessionData.authenticated && sessionData.name) setSolicitante(sessionData.name);
      })
      .catch(() => {});
  }, []);

  const submarcaOptions = useMemo(() => SUBMARCAS_BY_MARCA[marca], [marca]);

  function handleMarcaChange(novaMarca: Marca) {
    setMarca(novaMarca);
    setSubmarcaUuid(SUBMARCAS_BY_MARCA[novaMarca][0].uuid);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!titulo.trim() || !data || !local.trim() || !solicitante.trim() || !quemSeraCaptado.trim() || !briefing.trim()) {
      setError("Preencha todos os campos obrigatórios.");
      return;
    }
    if (roteiroPronto === "") {
      setError("Informe se o roteiro já está pronto.");
      return;
    }

    const roteiroFile = roteiroFileRef.current?.files?.[0] ?? null;

    if (roteiroPronto === "sim" && !roteiroTexto.trim() && !roteiroFile) {
      setError("Cole o roteiro em texto ou anexe um PDF.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/captacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo,
          marca,
          submarcaUuid,
          data,
          horaInicio,
          horaFim,
          local,
          solicitante,
          quemSeraCaptado,
          briefing,
          roteiroPronto: roteiroPronto === "sim",
          roteiroTexto: roteiroPronto === "sim" ? roteiroTexto : undefined,
          roteiroTemArquivo: roteiroPronto === "sim" && !!roteiroFile,
          prioridade,
        }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Erro desconhecido");

      if (roteiroFile) {
        const formData = new FormData();
        formData.append("arquivo", roteiroFile);
        const anexoRes = await fetch(`/api/captacoes/${body.task.id}/anexo`, {
          method: "POST",
          body: formData,
        });
        if (!anexoRes.ok) {
          const anexoBody = await anexoRes.json();
          throw new Error(`Task criada, mas o anexo do roteiro falhou: ${anexoBody.error}`);
        }
      }

      setSuccess(`Captação "${body.task?.name ?? titulo}" criada.`);
      onCreated();
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content card" style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <h2>Nova captação</h2>
        <p className="subtitle">Criando direto pelo calendário — a data já vem preenchida.</p>

        <form onSubmit={handleSubmit}>
          <div className="field-group">
            <label>Título</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Reels catálogo inverno" />
          </div>

          <div className="field-group">
            <label>Marca</label>
            <div className="pill-group">
              {MARCAS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`pill ${marca === m ? "selected" : ""}`}
                  onClick={() => handleMarcaChange(m)}
                >
                  <span className="pill-dot" style={{ background: MARCA_COLOR[m] }} />
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="form-row" style={{ marginBottom: 18 }}>
            <div>
              <label>Empresa / sub-marca</label>
              <select value={submarcaUuid} onChange={(e) => setSubmarcaUuid(e.target.value)}>
                {submarcaOptions.map((opt) => (
                  <option key={opt.uuid} value={opt.uuid}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Prioridade</label>
              <div style={{ display: "flex", gap: 6 }}>
                {PRIORIDADE.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    title={p.label}
                    onClick={() => setPrioridade(p.value)}
                    className={`pill ${prioridade === p.value ? "selected" : ""}`}
                    style={{ flex: 1, justifyContent: "center", padding: "8px 10px", fontSize: 12.5 }}
                  >
                    <span className="pill-dot" style={{ width: 8, height: 8, background: p.color }} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="field-group">
            <label>Data</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>

          <div className="form-row" style={{ marginBottom: 18 }}>
            <div>
              <label>Horário de início</label>
              <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
            </div>
            <div>
              <label>Horário de fim</label>
              <input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
            </div>
          </div>

          <div className="field-group">
            <label>Local</label>
            <input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ex: Estúdio SB, sala 2" />
          </div>

          <div className="form-row" style={{ marginBottom: 18 }}>
            <div>
              <label>Solicitante</label>
              <input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} />
            </div>
            <div>
              <label>Quem será captado</label>
              <input
                value={quemSeraCaptado}
                onChange={(e) => setQuemSeraCaptado(e.target.value)}
                placeholder="Pessoa/equipe no vídeo"
              />
            </div>
          </div>

          <div className="field-group">
            <label>Briefing</label>
            <textarea
              rows={3}
              value={briefing}
              onChange={(e) => setBriefing(e.target.value)}
              placeholder="Contexto, objetivo, referências, tom de voz…"
            />
          </div>

          <div className="roteiro-box">
            <p style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 11px" }}>Já tem o roteiro pronto?</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className={`pill ${roteiroPronto === "sim" ? "selected" : ""}`}
                style={{ padding: "9px 22px" }}
                onClick={() => setRoteiroPronto("sim")}
              >
                Sim
              </button>
              <button
                type="button"
                className={`pill ${roteiroPronto === "nao" ? "selected" : ""}`}
                style={{ padding: "9px 22px" }}
                onClick={() => setRoteiroPronto("nao")}
              >
                Não
              </button>
            </div>

            {roteiroPronto === "sim" && (
              <div className="step-content" style={{ marginTop: 14 }}>
                <label>Roteiro (texto)</label>
                <textarea
                  rows={3}
                  value={roteiroTexto}
                  onChange={(e) => setRoteiroTexto(e.target.value)}
                  placeholder="Cole o roteiro aqui, ou anexe um PDF abaixo."
                />
                <label className="file-drop">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <path d="M17 8l-5-5-5 5" />
                    <path d="M12 3v12" />
                  </svg>
                  Anexar PDF do roteiro
                  <input type="file" accept="application/pdf" ref={roteiroFileRef} style={{ display: "none" }} />
                </label>
              </div>
            )}

            {roteiroPronto === "nao" && (
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "12px 0 0", lineHeight: 1.5 }}>
                Vamos criar uma task para o Zion escrever o roteiro com base no briefing acima.
              </p>
            )}
          </div>

          {error && <div className="status-message error">{error}</div>}
          {success && <div className="status-message success">{success}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button type="button" className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Criando…" : "Criar captação"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
