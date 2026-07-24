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
const MAX_VISIBLE_PER_DAY = 3;

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
          const visible = dayEvents.slice(0, MAX_VISIBLE_PER_DAY);
          const hiddenCount = dayEvents.length - visible.length;
          return (
            <div
              className={`calendar-day${outside ? " outside" : ""}${isToday ? " today" : ""}`}
              key={day.toISOString()}
            >
              <div className={`day-number${isToday ? " today" : ""}`}>{day.getDate()}</div>
              {visible.map((ev) => {
                const cssVar = ev.marca ? MARCA_COLOR_VAR[ev.marca] : "--marca-outro";
                return (
                  <a
                    key={ev.id}
                    className="event-pill"
                    style={{ "--marca-color": `var(${cssVar})` } as React.CSSProperties}
                    href={ev.url}
                    target="_blank"
                    rel="noreferrer"
                    title={`${ev.name} · ${ev.marca ?? "Outro"}`}
                  >
                    {ev.name}
                  </a>
                );
              })}
              {hiddenCount > 0 && <div className="event-more">+{hiddenCount} mais</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
