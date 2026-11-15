// Copiar texto: API moderna (precisa de contexto seguro) com plano B via textarea oculto.
// `env` é injetável para teste; no navegador usa window/document.
export async function copyText(text, env = typeof window !== "undefined" ? window : {}) {
  const value = typeof text === "string" ? text : "";
  if (!value) return false;

  const nav = env.navigator;
  if (nav && nav.clipboard && typeof nav.clipboard.writeText === "function") {
    try {
      await nav.clipboard.writeText(value);
      return true;
    } catch (e) {
      // cai no plano B (permissão negada, página sem foco, contexto inseguro)
    }
  }

  const doc = env.document;
  if (!doc || typeof doc.createElement !== "function" || !doc.body || typeof doc.execCommand !== "function") return false;
  const area = doc.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  area.style.position = "fixed";
  area.style.top = "-1000px";
  area.style.opacity = "0";
  doc.body.appendChild(area);
  try {
    area.select();
    return !!doc.execCommand("copy");
  } catch (e) {
    return false;
  } finally {
    doc.body.removeChild(area);
  }
}
