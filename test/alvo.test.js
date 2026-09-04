import { describe, it, expect } from "vitest";
import { resolverAlvo } from "../src/acervo/alvo.js";

describe("resolverAlvo", () => {
  it("aceita a URL completa de um perfil do Instagram", () => {
    expect(resolverAlvo("https://www.instagram.com/fulano/")).toMatchObject({
      ok: true,
      handle: "fulano",
      profileKey: "ig:@fulano",
      urlDoPerfil: "https://www.instagram.com/fulano/",
    });
  });

  it("aceita a URL do TikTok, inclusive com prefixo de idioma", () => {
    expect(resolverAlvo("https://www.tiktok.com/pt-BR/@fulano")).toMatchObject({
      ok: true,
      handle: "fulano",
      profileKey: "tt:@fulano",
      urlDoPerfil: "https://www.tiktok.com/@fulano",
    });
  });

  it("normaliza a URL do perfil, tirando query string", () => {
    expect(resolverAlvo("https://www.instagram.com/fulano/?hl=pt-br").urlDoPerfil)
      .toBe("https://www.instagram.com/fulano/");
  });

  it("aceita chave de perfil salva, como vem da barra de endereço", () => {
    expect(resolverAlvo("ig:@fulano")).toMatchObject({
      ok: true, handle: "fulano", profileKey: "ig:@fulano",
      urlDoPerfil: "https://www.instagram.com/fulano/",
    });
    expect(resolverAlvo("tt:@fulano").urlDoPerfil).toBe("https://www.tiktok.com/@fulano");
  });

  it("aceita só o arroba, assumindo Instagram", () => {
    expect(resolverAlvo("@fulano")).toMatchObject({
      ok: true, profileKey: "ig:@fulano",
    });
  });

  it("aceita instagram.com sem protocolo", () => {
    expect(resolverAlvo("instagram.com/fulano").ok).toBe(true);
    expect(resolverAlvo("www.tiktok.com/@fulano").ok).toBe(true);
  });

  it("apara espaços em volta, que é o que acontece ao colar", () => {
    expect(resolverAlvo("  https://www.instagram.com/fulano/  ").ok).toBe(true);
  });

  it("recusa URL de post em vez de tratar como perfil", () => {
    const r = resolverAlvo("https://www.instagram.com/p/C4xY9k/");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/perfil/i);
  });

  it("recusa site que não é nosso, dizendo quais servem", () => {
    const r = resolverAlvo("https://youtube.com/@fulano");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/instagram|tiktok/i);
  });

  it("recusa entrada vazia", () => {
    expect(resolverAlvo("").ok).toBe(false);
    expect(resolverAlvo(null).ok).toBe(false);
  });
});
