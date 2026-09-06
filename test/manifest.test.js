import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

describe("manifest", () => {
  it("declara MV3", () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it("pede exatamente as permissões que o Acervo usa", () => {
    expect(new Set(manifest.permissions)).toEqual(
      new Set(["storage", "downloads", "declarativeNetRequest", "tabs", "scripting"]),
    );
  });

  it("tem acesso às duas plataformas e aos CDNs delas", () => {
    expect(manifest.host_permissions).toEqual([
      "*://*.instagram.com/*",
      "*://*.cdninstagram.com/*",
      "*://*.fbcdn.net/*",
      "*://*.tiktok.com/*",
      "*://*.tiktokcdn.com/*",
      "*://*.tiktokcdn-us.com/*",
    ]);
  });

  it("injeta o hook no mundo MAIN e o boot no ISOLATED", () => {
    const mundos = manifest.content_scripts.map((c) => c.world ?? "ISOLATED");
    expect(mundos).toContain("MAIN");
    expect(mundos).toContain("ISOLATED");
  });

  it("injeta o hook em document_start, antes do app rodar", () => {
    const hook = manifest.content_scripts.find((c) => c.world === "MAIN");
    expect(hook.run_at).toBe("document_start");
    expect(hook.js).toEqual(["src/page/captura.js"]);
  });

  it("expõe a aba do Acervo como página da extensão", () => {
    expect(manifest.action.default_title).toBe("Acervo");
  });

  it("não pede permissões perigosas que não precisamos", () => {
    const proibidas = ["cookies", "webRequest", "webRequestBlocking", "<all_urls>"];
    const pedidas = [
      ...(manifest.permissions ?? []),
      ...(manifest.host_permissions ?? []),
    ];
    for (const p of proibidas) expect(pedidas).not.toContain(p);
  });
});
