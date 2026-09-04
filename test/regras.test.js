import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const regras = JSON.parse(readFileSync("src/background/regras.json", "utf8"));
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

describe("regras de header", () => {
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

  it("todo host das regras está declarado no manifest", () => {
    const permitidos = manifest.host_permissions.join(" ");
    for (const r of regras) {
      const host = r.condition.urlFilter.replace(/^\|\|/, "").replace(/\*$/, "");
      expect(permitidos).toContain(host);
    }
  });
});
