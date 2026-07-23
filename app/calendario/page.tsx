"use client";

import { useEffect, useMemo, useState } from "react";

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

export default function CalendarPage() {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState<CaptacaoEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

  const days = useMemo(() => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CaptacaoEvent[]>();
    for (const ev of events) {
      const key = new Date(ev.start).toDateString();
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div>
      <div className="calendar-toolbar">
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
          ← Anterior
        </button>
        <strong style={{ textTransform: "capitalize" }}>{monthLabel}</strong>
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
          Próximo →
        </button>
      </div>

      <div className="legend">
        {Object.entries(MARCA_COLOR_VAR).map(([marca, cssVar]) => (
          <span className="legend-item" key={marca}>
            <span className="legend-swatch" style={{ background: `var(${cssVar})` }} />
            {marca}
          </span>
        ))}
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
          const dayEvents = eventsByDay.get(day.toDateString()) ?? [];
          return (
            <div className={`calendar-day${outside ? " outside" : ""}`} key={day.toISOString()}>
              <div className="day-number">{day.getDate()}</div>
              {dayEvents.map((ev) => {
                const cssVar = ev.marca ? MARCA_COLOR_VAR[ev.marca] : "--marca-outro";
                return (
                  <a
                    key={ev.id}
                    className="event-pill"
                    style={{ background: `var(${cssVar})` }}
                    href={ev.url}
                    target="_blank"
                    rel="noreferrer"
                    title={ev.name}
                  >
                    {ev.name}
                  </a>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
