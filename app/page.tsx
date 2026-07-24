"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MARCAS, SUBMARCAS_BY_MARCA, Marca } from "@/lib/config";

type Prioridade = "urgent" | "high" | "normal" | "low";

const PRIORIDADE: { value: Prioridade; label: string; color: string }[] = [
  { value: "urgent", label: "Urgente", color: "#ef4444" },
  { value: "high", label: "Alta", color: "#f59e0b" },
  { value: "normal", label: "Normal", color: "#5b8cff" },
  { value: "low", label: "Baixa", color: "#8a8a96" },
];

const MARCA_COLOR: Record<Marca, string> = {
  "SeuBoné": "var(--marca-seubone)",
  Carbone: "var(--marca-carbone)",
  Onevo: "var(--marca-onevo)",
  Weevo: "var(--marca-weevo)",
  Outro: "var(--marca-outro)",
};

const STEP_LABELS = ["Captação", "Agenda", "Conteúdo"];

const NOME_STORAGE_KEY = "sb_agenda_nome";

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function NomePrompt({ onConfirm }: { onConfirm: (nome: string) => void }) {
  const [nome, setNome] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nome.trim();
    if (!trimmed) return;
    localStorage.setItem(NOME_STORAGE_KEY, trimmed);
    onConfirm(trimmed);
  }

  return (
    <div className="card card-narrow">
      <div className="accent-tick" />
      <h2>Quem está marcando?</h2>
      <p className="subtitle">
        Digite seu nome uma vez. A gente guarda no navegador e preenche o solicitante pra você.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="field-group">
          <label>Seu nome</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Maria Clara" autoFocus required />
        </div>
        <button type="submit" className="btn btn-primary btn-block">
          Continuar
        </button>
      </form>
    </div>
  );
}

export default function NovaCaptacaoPage() {
  const [nome, setNome] = useState<string | null | undefined>(undefined);
  const [step, setStep] = useState(0);

  const [titulo, setTitulo] = useState("");
  const [marca, setMarca] = useState<Marca>("SeuBoné");
  const [submarcaUuid, setSubmarcaUuid] = useState(SUBMARCAS_BY_MARCA["SeuBoné"][0].uuid);
  const [data, setData] = useState("");
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
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(NOME_STORAGE_KEY);
    setNome(stored);
    if (stored) setSolicitante(stored);
  }, []);

  const submarcaOptions = useMemo(() => SUBMARCAS_BY_MARCA[marca], [marca]);

  function handleMarcaChange(novaMarca: Marca) {
    setMarca(novaMarca);
    setSubmarcaUuid(SUBMARCAS_BY_MARCA[novaMarca][0].uuid);
  }

  function goBack() {
    setError(null);
    if (step > 0) {
      setStep(step - 1);
    } else {
      localStorage.removeItem(NOME_STORAGE_KEY);
      setNome(null);
    }
  }

  function goNext() {
    setError(null);
    if (step === 0 && !titulo.trim()) {
      setError("Informe o título da captação.");
      return;
    }
    if (step === 1 && (!data || !local.trim())) {
      setError("Informe a data e o local.");
      return;
    }
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    handleSubmit();
  }

  async function handleSubmit() {
    if (!solicitante.trim() || !quemSeraCaptado.trim() || !briefing.trim()) {
      setError("Preencha solicitante, quem será captado e o briefing.");
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
    setResult(null);

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

      let message = `Task criada no ClickUp para ${titulo || "a captação"}, com evento no Google Calendar da marca ${marca}.`;
      if (body.precisaConfirmarPontuacao) {
        message += " Duração acima de 4h — confirme a pontuação com a Maria Clara.";
      }
      if (body.roteiroTask) {
        message += ` Criamos também a task de roteiro para o Zion.`;
      }
      if (body.roteiroTaskError) {
        message += ` Atenção: falha ao criar a task de roteiro (${body.roteiroTaskError}).`;
      }
      if (body.calendarSyncError) {
        message = `Task criada no ClickUp, mas o evento no Google Calendar falhou (${body.calendarSyncError}) — o próximo sync automático tenta de novo.`;
      }
      const resultType = body.calendarSyncError || body.roteiroTaskError ? "error" : "success";
      setResult({ type: resultType, message });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function restart() {
    setResult(null);
    setStep(0);
    setTitulo("");
    setLocal("");
    setQuemSeraCaptado("");
    setBriefing("");
    setRoteiroPronto("");
    setRoteiroTexto("");
    if (roteiroFileRef.current) roteiroFileRef.current.value = "";
  }

  if (nome === undefined) {
    return null;
  }

  if (!nome) {
    return (
      <NomePrompt
        onConfirm={(n) => {
          setNome(n);
          setSolicitante(n);
        }}
      />
    );
  }

  if (result && result.type === "success") {
    return (
      <div className="card" style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <div className="success-icon">
          <CheckIcon />
        </div>
        <h2>Captação criada</h2>
        <p className="subtitle" style={{ maxWidth: 400, margin: "0 auto 22px" }}>
          {result.message}
        </p>
        <button type="button" className="btn btn-primary" onClick={restart}>
          Marcar outra captação
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 660, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h2>Nova captação</h2>
        <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
          Marcando como <strong style={{ color: "var(--text)", fontWeight: 600 }}>{nome}</strong>{" "}
          ·{" "}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              localStorage.removeItem(NOME_STORAGE_KEY);
              setNome(null);
            }}
          >
            trocar
          </a>
        </span>
      </div>

      <div className="stepper">
        {STEP_LABELS.map((label, i) => {
          const status = i < step ? "done" : i === step ? "current" : "todo";
          return (
            <div key={label} style={{ display: "flex", alignItems: "center", flex: i < 2 ? 1 : undefined }}>
              <div className="step">
                <span className={`step-dot ${status}`}>{status === "done" ? <CheckIcon /> : i + 1}</span>
                <span className={`step-label ${status === "current" ? "active" : ""}`}>{label}</span>
              </div>
              {i < 2 && <div className={`step-connector ${i < step ? "done" : ""}`} />}
            </div>
          );
        })}
      </div>

      <div className="card">
        {step === 0 && (
          <div className="step-content">
            <p className="eyebrow">O que vamos gravar</p>
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
            <div className="form-row">
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
          </div>
        )}

        {step === 1 && (
          <div className="step-content">
            <p className="eyebrow">Quando e onde</p>
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
            <div>
              <label>Local</label>
              <input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ex: Estúdio SB, sala 2" />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="step-content">
            <p className="eyebrow">Conteúdo e roteiro</p>
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
                rows={4}
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
          </div>
        )}

        {(error || result?.type === "error") && (
          <div className="status-message error">{error ?? result?.message}</div>
        )}

        <div className="wizard-nav">
          <button type="button" className="btn" onClick={goBack}>
            Voltar
          </button>
          <span className="step-of">Etapa {step + 1} de 3</span>
          <button type="button" className="btn btn-primary" onClick={goNext} disabled={submitting}>
            {submitting ? "Criando…" : step < 2 ? "Continuar" : "Criar captação"}
          </button>
        </div>
      </div>
    </div>
  );
}
