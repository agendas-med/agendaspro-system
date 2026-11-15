// URLs de arquivos devolvidas pela API.
//  - S3 privado: o core grava `<PUBLIC_API_URL>/files/s3/<chave>` (302 para URL assinada); usa-se como veio.
//  - Legado: estáticos saíram de `/public/*` para `/static/*` (o core mantém 301 só para /public/uploads).
//  - Caminhos relativos são resolvidos contra a base da API.
// `data:` e `blob:` (pré-visualização local) passam intactos.

export function resolveFileUrl(url, apiBase = "") {
  if (url == null) return "";
  const raw = String(url).trim();
  if (raw === "") return "";
  if (/^(data|blob):/i.test(raw)) return raw;

  const base = String(apiBase || "").replace(/\/+$/, "");

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.pathname === "/public" || parsed.pathname.startsWith("/public/")) {
        parsed.pathname = "/static" + parsed.pathname.slice("/public".length);
        return parsed.toString();
      }
    } catch {
      return raw;
    }
    return raw;
  }

  let path = raw.startsWith("/") ? raw : "/" + raw;
  if (path === "/public" || path.startsWith("/public/")) path = "/static" + path.slice("/public".length);
  return base + path;
}
