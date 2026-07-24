const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("sb_agenda_theme");
    if (stored === "dark" || stored === "light") {
      document.documentElement.setAttribute("data-theme", stored);
    }
  } catch (e) {}
})();
`;

/** Aplica o tema salvo antes da primeira pintura, evitando flash de tema errado. */
export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
