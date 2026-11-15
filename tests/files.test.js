import { describe, it, expect } from "vitest";
import { resolveFileUrl } from "../utils/files.js";

const API = "https://api.exemplo.test";

describe("resolveFileUrl", () => {
  it("troca /public por /static (relativo e absoluto)", () => {
    expect(resolveFileUrl("/public/default-user-image.png", API)).toBe(`${API}/static/default-user-image.png`);
    expect(resolveFileUrl("public/uploads/a.png", API)).toBe(`${API}/static/uploads/a.png`);
    expect(resolveFileUrl(`${API}/public/uploads/a.png`, API)).toBe(`${API}/static/uploads/a.png`);
  });
  it("mantém /files/s3/<chave> e /static como vieram", () => {
    expect(resolveFileUrl(`${API}/files/s3/companies/1/a.png`, API)).toBe(`${API}/files/s3/companies/1/a.png`);
    expect(resolveFileUrl("/files/s3/x.png", `${API}/`)).toBe(`${API}/files/s3/x.png`);
    expect(resolveFileUrl("/static/a.png", API)).toBe(`${API}/static/a.png`);
  });
  it("não mexe em data:, blob: nem em hosts externos", () => {
    expect(resolveFileUrl("data:image/png;base64,AAA", API)).toBe("data:image/png;base64,AAA");
    expect(resolveFileUrl("blob:http://x/1", API)).toBe("blob:http://x/1");
    expect(resolveFileUrl("https://cdn.exemplo.test/a.png", API)).toBe("https://cdn.exemplo.test/a.png");
  });
  it("não confunde pastas com prefixo parecido", () => {
    expect(resolveFileUrl("/publicidade/a.png", API)).toBe(`${API}/publicidade/a.png`);
  });
  it("vazio devolve vazio", () => {
    expect(resolveFileUrl(null, API)).toBe("");
    expect(resolveFileUrl("  ", API)).toBe("");
  });
});
