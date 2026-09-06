import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const regras = JSON.parse(readFileSync("src/background/regras.json", "utf8"));
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

describe("regras de header", () => {
  it("nenhuma regra força Origin: isso quebraria a requisição em CORS", () => {
    for (const r of regras) {
      const origem = r.action.requestHeaders.find((h) => h.header === "Origin");
      if (origem) expect(origem.operation).toBe("remove");
    }
  });

  it("tem ids únicos e positivos", () => {
    const ids = regras.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => Number.isInteger(id) && id > 0)).toBe(true);
  });

  it("cobre os CDNs das duas plataformas", () => {
    const filtros = regras.map((r) => r.condition.urlFilter).join(" ");
    for (const host of ["cdninstagram.com", "fbcdn.net", "tiktokcdn.com"]) {
      expect(filtros).toContain(host);
    }
  });

  it("põe o Referer certo em cada CDN", () => {
    const doIG = regras.find((r) => r.condition.urlFilter.includes("cdninstagram"));
    const refIG = doIG.action.requestHeaders.find((h) => h.header.toLowerCase() === "referer");
    expect(refIG.value).toBe("https://www.instagram.com/");

    const doTT = regras.find((r) => r.condition.urlFilter.includes("tiktokcdn.com"));
    const refTT = doTT.action.requestHeaders.find((h) => h.header.toLowerCase() === "referer");
    expect(refTT.value).toBe("https://www.tiktok.com/");
  });

  it("só age em request de extensão, nunca no tráfego normal da página", () => {
    for (const r of regras) {
      expect(r.action.type).toBe("modifyHeaders");
      expect(r.condition.resourceTypes).toEqual(["xmlhttprequest"]);
    }
  });

  it("ajusta o Referer da leitura da pagina do perfil", () => {
    // O alcance desta regra e modesto e vale registrar: ela serve ao GET da
    // pagina do perfil, de onde saem o identificador e o token. O feed nao
    // passa por aqui — ele e buscado de dentro da aba.
    const direta = regras.find((r) => r.condition.urlFilter === "||instagram.com");
    expect(direta).toBeTruthy();

    const nomes = direta.action.requestHeaders.map((h) => h.header.toLowerCase());
    expect(nomes).toContain("referer");

    const origem = direta.action.requestHeaders.find((h) => h.header === "Origin");
    expect(origem.operation).toBe("remove");
  });

  it("nao tenta reescrever Sec-Fetch, que o navegador nao deixa", () => {
    // A v0.19.0 tentou, em campo, e o Instagram seguiu devolvendo a pagina do
    // site: esses cabecalhos sao controlados pelo navegador e a regra passa em
    // branco. Config morta que parece viva ja custou rodadas de diagnostico
    // apontando a causa errada.
    const direta = regras.find((r) => r.condition.urlFilter === "||instagram.com");
    const nomes = direta.action.requestHeaders.map((h) => h.header.toLowerCase());
    expect(nomes.some((n) => n.startsWith("sec-fetch"))).toBe(false);
  });


  it("todo host das regras está declarado no manifest", () => {
    const permitidos = manifest.host_permissions.join(" ");
    for (const r of regras) {
      const host = r.condition.urlFilter.replace(/^\|\|/, "").replace(/\*$/, "");
      expect(permitidos).toContain(host);
    }
  });
});
