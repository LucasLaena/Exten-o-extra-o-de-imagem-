import { describe, it, expect, vi } from "vitest";
import { criarRoteador, URL_ACERVO } from "../src/background/roteador.js";

function apiFalsa(sobrescrever = {}) {
  return {
    runtime: { getURL: (p) => `chrome-extension://abc/${p}` },
    tabs: {
      query: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 7 }),
      update: vi.fn().mockResolvedValue({ id: 7 }),
      sendMessage: vi.fn().mockResolvedValue("resposta-da-aba"),
    },
    ...sobrescrever,
  };
}

describe("abrirAcervo", () => {
  it("cria a aba na primeira vez, com os parâmetros na URL", async () => {
    const api = apiFalsa();
    const r = criarRoteador(api);
    await r.abrirAcervo({ perfil: "ig:@fulano" });
    expect(api.tabs.create).toHaveBeenCalledOnce();
    const url = api.tabs.create.mock.calls[0][0].url;
    expect(url).toContain(URL_ACERVO);
    expect(new URL(url).searchParams.get("perfil")).toBe("ig:@fulano");
  });

  it("reusa e foca a aba já aberta em vez de abrir outra", async () => {
    const api = apiFalsa();
    api.tabs.query.mockResolvedValue([{ id: 42 }]);
    const r = criarRoteador(api);
    await r.abrirAcervo({ perfil: "ig:@fulano" });
    expect(api.tabs.create).not.toHaveBeenCalled();
    expect(api.tabs.update).toHaveBeenCalledWith(42, expect.objectContaining({ active: true }));
  });
});

describe("aoReceberMensagem", () => {
  it("abre o Acervo quando o content script pede", async () => {
    const api = apiFalsa();
    const r = criarRoteador(api);
    await r.aoReceberMensagem({ tipo: "abrirAcervo", perfil: "tt:@x" }, {});
    expect(api.tabs.create).toHaveBeenCalledOnce();
  });

  it("ignora mensagem de tipo desconhecido sem explodir", async () => {
    const r = criarRoteador(apiFalsa());
    await expect(r.aoReceberMensagem({ tipo: "sei-la" }, {})).resolves.toBeUndefined();
  });

});
