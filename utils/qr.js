// QR Code do link de WhatsApp. Gera só números (matriz de módulos -> caminho SVG), então a tela
// renderiza <svg><path :d="..."/></svg> sem v-html. Biblioteca: qrcode-generator (sem dependências).
import qrcode from "qrcode-generator";

export const QUIET_ZONE = 4; // módulos de margem exigidos pela especificação

// Retorna { size, path } (size inclui a margem) ou null se o texto estiver vazio/for grande demais.
export function buildQr(text, { errorCorrection = "M" } = {}) {
  const value = typeof text === "string" ? text : "";
  if (!value) return null;
  let qr;
  try {
    qr = qrcode(0, errorCorrection); // 0 = versão automática
    qr.addData(value);
    qr.make();
  } catch (e) {
    return null;
  }
  const count = qr.getModuleCount();
  let path = "";
  for (let row = 0; row < count; row++) {
    let col = 0;
    while (col < count) {
      if (!qr.isDark(row, col)) {
        col++;
        continue;
      }
      let end = col;
      while (end < count && qr.isDark(row, end)) end++;
      path += `M${col + QUIET_ZONE},${row + QUIET_ZONE}h${end - col}v1h-${end - col}z`;
      col = end;
    }
  }
  return { size: count + QUIET_ZONE * 2, path };
}

// SVG completo (só números no caminho) para download; fundo branco para escanear bem impresso.
export function qrSvgMarkup(qr, pixels = 512) {
  if (!qr) return "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 ${qr.size} ${qr.size}" shape-rendering="crispEdges">`
    + `<rect width="${qr.size}" height="${qr.size}" fill="#ffffff"/><path d="${qr.path}" fill="#000000"/></svg>`;
}
