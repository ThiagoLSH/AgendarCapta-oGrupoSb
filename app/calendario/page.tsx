"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CaptacaoModal from "./CaptacaoModal";
import { MARCAS, Marca } from "@/lib/config";
import { toFortalezaParts } from "@/lib/timezone";

interface CaptacaoEvent {
  id: string;
  name: string;
  url: string;
  start: number;
  end: number;
  marca: string | null;
  submarca: string | null;
  status: string;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Janela de referência da mini barra de tempo dentro de cada dia do calendário mensal
// (estilo "day view" do Google Calendar, só que espremido na célula do mês). Captações
// raramente saem de 06h–23h no fuso de Fortaleza (ver PERIODO_HORA_PADRAO em lib/naming.ts:
// Manhã=09h, Tarde=14h, Noite=19h, e periodoFromHour em lib/config.ts já classifica >=18h
// como Noite) — se um dia isso passar a não bastar, é só ajustar as duas constantes abaixo.
const TIMELINE_START_HOUR = 6;
const TIMELINE_END_HOUR = 23;
// Duração mínima (em horas, dentro da janela acima) que uma barra ocupa visualmente, pra
// captações curtas não virarem uma linha invisível de 1px.
const TIMELINE_MIN_DURATION_HOURS = 0.75;
// Linhas-guia sutis dentro da barra, só de referência visual (10h, 14h, 18h).
const TIMELINE_GUIDE_HOURS = [10, 14, 18];

type MarcaFilter = Marca | "Todas";
const MARCA_FILTER_OPTIONS: MarcaFilter[] = ["Todas", ...MARCAS];

const MARCA_COLOR_VAR: Record<string, string> = {
  "SeuBoné": "--marca-seubone",
  Carbone: "--marca-carbone",
  Onevo: "--marca-onevo",
  Weevo: "--marca-weevo",
  Outro: "--marca-outro",
};

function buildMonthGrid(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toInputDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Hora fracionária (ex.: 14h30 -> 14.5) no fuso de Fortaleza, a partir de um epoch ms. */
function hourFraction(epochMs: number): number {
  const { hour, minute } = toFortalezaParts(new Date(epochMs));
  return hour + minute / 60;
}

/** "HH:mm" no fuso de Fortaleza, pro tooltip/rótulo da barra. */
function formatHourLabel(epochMs: number): string {
  const { hour, minute } = toFortalezaParts(new Date(epochMs));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Posição (top/altura em %) da barra de uma captação dentro da mini timeline do dia,
 * proporcional ao horário real dentro da janela TIMELINE_START_HOUR–TIMELINE_END_HOUR.
 * As captações já não se sobrepõem no tempo (trava em lib/conflict.ts), então não
 * precisamos resolver colisão visual — só posicionar cada uma no seu lugar.
 */
function resolveTimelinePosition(startMs: number, endMs: number): { topPct: number; heightPct: number } {
  const span = TIMELINE_END_HOUR - TIMELINE_START_HOUR;
  const clamp = (v: number) => Math.min(Math.max(v, TIMELINE_START_HOUR), TIMELINE_END_HOUR);

  let start = clamp(hourFraction(startMs));
  let end = clamp(hourFraction(endMs));

  if (end - start < TIMELINE_MIN_DURATION_HOURS) {
    end = Math.min(start + TIMELINE_MIN_DURATION_HOURS, TIMELINE_END_HOUR);
    start = Math.max(end - TIMELINE_MIN_DURATION_HOURS, TIMELINE_START_HOUR);
  }

  return {
    topPct: ((start - TIMELINE_START_HOUR) / span) * 100,
    heightPct: ((end - start) / span) * 100,
  };
}

export default function CalendarPage() {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState<CaptacaoEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [marcaFilter, setMarcaFilter] = useState<MarcaFilter>("Todas");

  const loadEvents = useCallback(() => {
    setLoading(true);
    fetch("/api/tasks")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setEvents(data.events);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const days = useMemo(() => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  const filteredEvents = useMemo(() => {
    if (marcaFilter === "Todas") return events;
    return events.filter((ev) => {
      // Tasks sem marca reconhecida caem visualmente no grupo "Outro" (mesma
      // regra da cor do pill), então o filtro "Outro" também as inclui.
      const marca = ev.marca ?? "Outro";
      return marca === marcaFilter;
    });
  }, [events, marcaFilter]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CaptacaoEvent[]>();
    for (const ev of filteredEvents) {
      const key = new Date(ev.start).toDateString();
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [filteredEvents]);

  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div>
      <div className="calendar-toolbar">
        <div className="cal-nav">
          <button
            type="button"
            className="btn btn-square"
            aria-label="Mês anterior"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            className="btn btn-square"
            aria-label="Próximo mês"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
          <strong>{monthLabel}</strong>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            Hoje
          </button>
        </div>

        <div className="cal-filter">
          <label htmlFor="marca-filter">Marca:</label>
          <select
            id="marca-filter"
            value={marcaFilter}
            onChange={(e) => setMarcaFilter(e.target.value as MarcaFilter)}
          >
            {MARCA_FILTER_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        <div className="legend">
          {Object.entries(MARCA_COLOR_VAR).map(([marca, cssVar]) => (
            <span className="legend-item" key={marca}>
              <span className="legend-swatch" style={{ background: `var(${cssVar})` }} />
              {marca}
            </span>
          ))}
        </div>
      </div>

      {loading && <p>Carregando captações do ClickUp…</p>}
      {error && <p className="status-message error">Erro ao carregar: {error}</p>}

      <div className="calendar-grid">
        {WEEKDAYS.map((d) => (
          <div className="calendar-weekday" key={d}>
            {d}
          </div>
        ))}
        {days.map((day) => {
          const outside = day.getMonth() !== cursor.getMonth();
          const isToday = isSameDay(day, today);
          const dayEvents = eventsByDay.get(day.toDateString()) ?? [];
          return (
            <div
              className={`calendar-day clickable${outside ? " outside" : ""}${isToday ? " today" : ""}`}
              key={day.toISOString()}
              onClick={() => setModalDate(toInputDate(day))}
              title="Clique para marcar uma captação neste dia"
            >
              <div className={`day-number${isToday ? " today" : ""}`}>{day.getDate()}</div>
              <div className="day-timeline">
                {TIMELINE_GUIDE_HOURS.map((h) => (
                  <span
                    key={h}
                    className="day-timeline-guide"
                    style={{ top: `${((h - TIMELINE_START_HOUR) / (TIMELINE_END_HOUR - TIMELINE_START_HOUR)) * 100}%` }}
                  />
                ))}
                {dayEvents.map((ev) => {
                  const cssVar = ev.marca ? MARCA_COLOR_VAR[ev.marca] ?? "--marca-outro" : "--marca-outro";
                  const { topPct, heightPct } = resolveTimelinePosition(ev.start, ev.end);
                  const horario = `${formatHourLabel(ev.start)}–${formatHourLabel(ev.end)}`;
                  return (
                    <a
                      key={ev.id}
                      className="timeline-event"
                      style={
                        {
                          top: `${topPct}%`,
                          height: `${heightPct}%`,
                          "--marca-color": `var(${cssVar})`,
                        } as React.CSSProperties
                      }
                      href={ev.url}
                      target="_blank"
                      rel="noreferrer"
                      title={`${ev.name} · ${ev.marca ?? "Outro"} · ${horario}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="timeline-event-label">{ev.name}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {modalDate && (
        <CaptacaoModal
          initialDate={modalDate}
          onClose={() => setModalDate(null)}
          onCreated={loadEvents}
        />
      )}
    </div>
  );
}
