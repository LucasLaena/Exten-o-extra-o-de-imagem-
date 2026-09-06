import { describe, it, expect } from "vitest";
import { consumirAcao } from "../src/acervo/acao.js";

describe("consumir a ação que abriu a aba", () => {
  it("devolve a ação e tira ela do endereço", () => {
    // Era o bug: a acao ficava na URL e todo recarregamento disparava de novo
    // um download que ninguem pediu, com a janela modal por cima da tela.
    const r = consumirAcao("?perfil=ig%3A%40x&acao=baixar&aba=7");

    expect(r.acao).toBe("baixar");
    expect(r.busca).not.toContain("acao");
    expect(r.busca).toContain("perfil=");
    expect(r.busca).toContain("aba=7");
  });

  it("consumir duas vezes não repete a ação", () => {
    const primeira = consumirAcao("?perfil=x&acao=baixar");
    const segunda = consumirAcao(primeira.busca);

    expect(primeira.acao).toBe("baixar");
    expect(segunda.acao).toBeNull();
  });

  it("aceita a busca com ou sem interrogação", () => {
    expect(consumirAcao("acao=indexar").acao).toBe("indexar");
    expect(consumirAcao("?acao=indexar").acao).toBe("indexar");
  });

  it("sem ação, o endereço volta intacto", () => {
    const r = consumirAcao("?perfil=ig%3A%40x");
    expect(r.acao).toBeNull();
    expect(r.busca).toBe("?perfil=ig%3A%40x");
  });

  it("endereço que só tinha a ação fica vazio, sem interrogação solta", () => {
    expect(consumirAcao("?acao=baixar").busca).toBe("");
  });

  it("não inventa ação a partir de vazio", () => {
    expect(consumirAcao("").acao).toBeNull();
    expect(consumirAcao(undefined).acao).toBeNull();
    expect(consumirAcao("?acao=").acao).toBeNull();
  });

  it("preserva o pedido, que é o que configura a tela", () => {
    const pedido = encodeURIComponent(JSON.stringify({ filtro: "videos", ate: 100 }));
    const r = consumirAcao(`?acao=baixar&pedido=${pedido}`);

    expect(r.acao).toBe("baixar");
    expect(new URLSearchParams(r.busca).get("pedido")).toContain("videos");
  });
});
