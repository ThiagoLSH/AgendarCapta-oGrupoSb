import { Marca } from "./config";

export type Prioridade = "urgent" | "high" | "normal" | "low";

export const PRIORIDADE: { value: Prioridade; label: string; color: string }[] = [
  { value: "urgent", label: "Urgente", color: "#ef4444" },
  { value: "high", label: "Alta", color: "#f59e0b" },
  { value: "normal", label: "Normal", color: "#5b8cff" },
  { value: "low", label: "Baixa", color: "#8a8a96" },
];

export const MARCA_COLOR: Record<Marca, string> = {
  "SeuBoné": "var(--marca-seubone)",
  Carbone: "var(--marca-carbone)",
  Onevo: "var(--marca-onevo)",
  Weevo: "var(--marca-weevo)",
  Outro: "var(--marca-outro)",
};
