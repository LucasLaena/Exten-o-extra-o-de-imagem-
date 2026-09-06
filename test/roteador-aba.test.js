import { describe, it, expect, vi } from "vitest";
import { criarRoteador } from "../src/background/roteador.js";

const apiFalsa = () => ({
  runtime: { getURL: (p) => `chrome-extension://abc/${p}` },
  tabs: {
    query: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 7 }),
    update: vi.fn().mockResolvedValue({ id: 7 }),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
});

describe("abrirAcervo com a aba de origem", () => {
  it("põe o id da aba do perfil na URL, para o Acervo saber de onde paginar", async () => {
    const api = apiFalsa();
    const r = criarRoteador(api);
    await r.aoReceberMensagem(
      { tipo: "abrirAcervo", perfil: "ig:@fulano", acao: "indexar" },
      { tab: { id: 33 } },
    );
    const url = new URL(api.tabs.create.mock.calls[0][0].url);
    expect(url.searchParams.get("aba")).toBe("33");
    expect(url.searchParams.get("acao")).toBe("indexar");
    expect(url.searchParams.get("perfil")).toBe("ig:@fulano");
  });

  it("funciona sem aba de origem, como no clique no ícone da extensão", async () => {
    const api = apiFalsa();
    const r = criarRoteador(api);
    await r.abrirAcervo();
    const url = new URL(api.tabs.create.mock.calls[0][0].url);
    expect(url.searchParams.get("aba")).toBeNull();
  });

  it("leva o pedido do modal junto, serializado", async () => {
    const api = apiFalsa();
    const r = criarRoteador(api);
    const pedido = { filtro: "videos", ordenacao: "views", modo: "faixa", de: 1, ate: 100 };
    await r.aoReceberMensagem(
      { tipo: "abrirAcervo", perfil: "ig:@f", acao: "baixar", pedido },
      { tab: { id: 5 } },
    );
    const url = new URL(api.tabs.create.mock.calls[0][0].url);
    expect(JSON.parse(url.searchParams.get("pedido"))).toEqual(pedido);
  });
});
