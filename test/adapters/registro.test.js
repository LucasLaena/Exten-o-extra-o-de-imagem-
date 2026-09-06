import { describe, it, expect } from "vitest";
import {
  ADAPTADORES,
  adaptadorDaUrl,
  adaptadorPorId,
  chaveDePerfil,
} from "../../src/adapters/index.js";

describe("registro", () => {
  it("tem as duas plataformas", () => {
    expect(ADAPTADORES.map((a) => a.id).sort()).toEqual(["instagram", "tiktok"]);
  });

  it("todo adaptador declara prefixo e rótulo", () => {
    for (const a of ADAPTADORES) {
      expect(a.prefixo).toMatch(/^(ig|tt)$/);
      expect(a.rotulo).toBeTypeOf("string");
    }
  });

  it("despacha por URL", () => {
    expect(adaptadorDaUrl("https://www.instagram.com/fulano/").id).toBe("instagram");
    expect(adaptadorDaUrl("https://www.tiktok.com/@fulano").id).toBe("tiktok");
  });

  it("devolve null para site que não é nosso", () => {
    expect(adaptadorDaUrl("https://exemplo.com/fulano")).toBeNull();
    expect(adaptadorDaUrl("lixo")).toBeNull();
  });

  it("devolve null para URL da plataforma que não é perfil", () => {
    expect(adaptadorDaUrl("https://www.instagram.com/p/C4xY9k/")).toBeNull();
  });

  it("busca por id", () => {
    expect(adaptadorPorId("tiktok").id).toBe("tiktok");
    expect(adaptadorPorId("orkut")).toBeNull();
  });

  it("monta a chave de perfil no formato do banco", () => {
    expect(chaveDePerfil(adaptadorPorId("instagram"), "fulano")).toBe("ig:@fulano");
    expect(chaveDePerfil(adaptadorPorId("tiktok"), "fulano")).toBe("tt:@fulano");
  });

  it("normaliza o arroba e a caixa ao montar a chave", () => {
    expect(chaveDePerfil(adaptadorPorId("tiktok"), "@Fulano")).toBe("tt:@fulano");
  });
});

describe("instagram.ehPerfil", () => {
  const ig = adaptadorPorId("instagram");

  it.each([
    "https://www.instagram.com/fulano/",
    "https://www.instagram.com/fulano",
    "https://instagram.com/fulano/",
    "https://www.instagram.com/fulano/reels/",
    "https://www.instagram.com/fulano/tagged/",
    "https://www.instagram.com/fulano/?hl=pt-br",
    "https://www.instagram.com/nome.com_ponto/",
  ])("reconhece %s", (url) => {
    expect(ig.ehPerfil(url)).toBe(true);
  });

  it.each([
    "https://www.instagram.com/",
    "https://www.instagram.com/p/C4xY9k/",
    "https://www.instagram.com/reel/C4xY9k/",
    "https://www.instagram.com/reels/audio/123/",
    "https://www.instagram.com/explore/tags/gato/",
    "https://www.instagram.com/accounts/edit/",
    "https://www.instagram.com/direct/inbox/",
    "https://www.instagram.com/stories/fulano/123/",
    "https://www.instagram.com/fulano/p/C4xY9k/",
  ])("rejeita %s", (url) => {
    expect(ig.ehPerfil(url)).toBe(false);
  });

  it("extrai o handle", () => {
    expect(ig.handleDaUrl("https://www.instagram.com/fulano/reels/")).toBe("fulano");
    expect(ig.handleDaUrl("https://www.instagram.com/p/X/")).toBeNull();
  });
});

describe("tiktok.ehPerfil", () => {
  const tt = adaptadorPorId("tiktok");

  it.each([
    "https://www.tiktok.com/@fulano",
    "https://www.tiktok.com/@fulano/",
    "https://www.tiktok.com/@fulano?lang=pt-BR",
    "https://www.tiktok.com/@fulano?is_from_webapp=1&sender_device=pc",
    "https://www.tiktok.com/@nome.com_ponto",
    "https://www.tiktok.com/@nome-com-hifen",
    "https://www.tiktok.com/@umnomedeusuariobemlongoassim",
    "https://tiktok.com/@fulano",
    // O TikTok põe o idioma no caminho. Quem usa o site em português cai
    // nessa forma o tempo todo.
    "https://www.tiktok.com/pt-BR/@fulano",
    "https://www.tiktok.com/en/@fulano",
    "https://www.tiktok.com/zh-Hant/@fulano",
  ])("reconhece %s", (url) => {
    expect(tt.ehPerfil(url)).toBe(true);
  });

  it("extrai o handle mesmo com prefixo de idioma", () => {
    expect(tt.handleDaUrl("https://www.tiktok.com/pt-BR/@fulano")).toBe("fulano");
  });

  it.each([
    "https://www.tiktok.com/",
    "https://www.tiktok.com/foryou",
    "https://www.tiktok.com/explore",
    "https://www.tiktok.com/@fulano/video/123456",
    "https://www.tiktok.com/pt-BR/foryou",
    "https://www.tiktok.com/tag/gato",
    "https://www.tiktok.com/music/algo-123",
    "https://www.tiktok.com/search?q=gato",
    "https://www.tiktok.com/fulano",
  ])("rejeita %s", (url) => {
    expect(tt.ehPerfil(url)).toBe(false);
  });

  it("extrai o handle sem o arroba", () => {
    expect(tt.handleDaUrl("https://www.tiktok.com/@fulano?lang=pt")).toBe("fulano");
    expect(tt.handleDaUrl("https://www.tiktok.com/foryou")).toBeNull();
  });
});
