"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MARCAS, SUBMARCAS_BY_MARCA, Marca } from "@/lib/config";

type Prioridade = "urgent" | "high" | "normal" | "low";

const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  urgent: "Urgente",
  high: "Alta",
  normal: "Normal",
  low: "Baixa",
};

const NOME_STORAGE_KEY = "sb_agenda_nome";

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
    <div style={{ maxWidth: 360, margin: "80px auto" }}>
      <h2>Quem está marcando?</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Seu nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus required />
        </label>
        <button type="submit">Continuar</button>
      </form>
    </div>
  );
}

export default function NovaCaptacaoPage() {
  const [nome, setNome] = useState<string | null | undefined>(undefined);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    const roteiroFile = roteiroFileRef.current?.files?.[0] ?? null;

    if (roteiroPronto === "sim" && !roteiroTexto.trim() && !roteiroFile) {
      setResult({ type: "error", message: "Informe o roteiro em texto ou anexe um PDF." });
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

      let message = `Task criada: ${body.task.name} (${body.pontos} pontos).`;
      if (body.precisaConfirmarPontuacao) {
        message += " Duração acima de 4h — confirme a pontuação com a Maria Clara.";
      }
      if (body.roteiroTask) {
        message += ` Task de roteiro criada para o Zion: ${body.roteiroTask.name}.`;
      }
      if (body.roteiroTaskError) {
        message += ` Atenção: falha ao criar a task de roteiro (${body.roteiroTaskError}).`;
      }
      if (body.calendarSyncError) {
        message += ` Task criada no ClickUp, mas o evento no Google Calendar falhou (${body.calendarSyncError}) — o próximo sync automático tenta de novo.`;
      }
      const resultType = body.calendarSyncError || body.roteiroTaskError ? "error" : "success";
      setResult({ type: resultType, message });

      setTitulo("");
      setLocal("");
      setQuemSeraCaptado("");
      setBriefing("");
      setRoteiroPronto("");
      setRoteiroTexto("");
      if (roteiroFileRef.current) roteiroFileRef.current.value = "";
    } catch (err) {
      setResult({ type: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
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

  return (
    <div>
      <h2>Nova captação</h2>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: -8 }}>
        Marcando como <strong>{nome}</strong>.{" "}
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
      </p>
      <form onSubmit={handleSubmit}>
        <label>
          Título
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
        </label>

        <div className="form-row">
          <label>
            Marca
            <select value={marca} onChange={(e) => handleMarcaChange(e.target.value as Marca)}>
              {MARCAS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label>
            Empresa
            <select value={submarcaUuid} onChange={(e) => setSubmarcaUuid(e.target.value)}>
              {submarcaOptions.map((opt) => (
                <option key={opt.uuid} value={opt.uuid}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Data
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
        </label>

        <div className="form-row">
          <label>
            Horário de início
            <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} required />
          </label>
          <label>
            Horário de fim
            <input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} required />
          </label>
        </div>

        <label>
          Local
          <input value={local} onChange={(e) => setLocal(e.target.value)} required />
        </label>

        <label>
          Solicitante
          <input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} required />
        </label>

        <label>
          Quem será captado
          <input
            value={quemSeraCaptado}
            onChange={(e) => setQuemSeraCaptado(e.target.value)}
            placeholder="Nome da pessoa/equipe que aparece no vídeo"
            required
          />
        </label>

        <label>
          Briefing
          <textarea
            value={briefing}
            onChange={(e) => setBriefing(e.target.value)}
            rows={5}
            placeholder="Contexto, objetivo, referências, tom de voz…"
            required
          />
        </label>

        <fieldset style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 12 }}>
          <legend style={{ fontSize: 13, fontWeight: 600, padding: "0 4px" }}>
            Já tem o roteiro pronto?
          </legend>
          <div className="form-row" style={{ marginBottom: roteiroPronto === "sim" ? 12 : 0 }}>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <input
                type="radio"
                name="roteiroPronto"
                value="sim"
                checked={roteiroPronto === "sim"}
                onChange={() => setRoteiroPronto("sim")}
                required
              />
              Sim
            </label>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <input
                type="radio"
                name="roteiroPronto"
                value="nao"
                checked={roteiroPronto === "nao"}
                onChange={() => setRoteiroPronto("nao")}
              />
              Não
            </label>
          </div>

          {roteiroPronto === "sim" && (
            <>
              <label>
                Roteiro (texto)
                <textarea
                  value={roteiroTexto}
                  onChange={(e) => setRoteiroTexto(e.target.value)}
                  rows={4}
                  placeholder="Cole o roteiro aqui, ou anexe um PDF abaixo"
                />
              </label>
              <label>
                Ou anexar PDF
                <input type="file" accept="application/pdf" ref={roteiroFileRef} />
              </label>
            </>
          )}

          {roteiroPronto === "nao" && (
            <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
              Vamos criar uma task para o Zion escrever o roteiro com base no briefing acima.
            </p>
          )}
        </fieldset>

        <label>
          Prioridade
          <select value={prioridade} onChange={(e) => setPrioridade(e.target.value as Prioridade)}>
            {(Object.keys(PRIORIDADE_LABEL) as Prioridade[]).map((p) => (
              <option key={p} value={p}>
                {PRIORIDADE_LABEL[p]}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" disabled={submitting}>
          {submitting ? "Criando…" : "Criar captação"}
        </button>

        {result && <div className={`status-message ${result.type}`}>{result.message}</div>}
      </form>
    </div>
  );
}
