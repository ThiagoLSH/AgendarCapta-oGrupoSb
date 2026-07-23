import { redirect } from "next/navigation";

// "Nova captação" virou a página inicial ("/"). Mantido só por compatibilidade
// com links antigos que já tenham sido compartilhados.
export default function NovaCaptacaoRedirect() {
  redirect("/");
}
