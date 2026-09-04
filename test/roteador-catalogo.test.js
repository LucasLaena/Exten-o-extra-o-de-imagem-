import { describe, it, expect, vi } from "vitest";
import { criarRoteador } from "../src/background/roteador.js";

function ambiente() {
  const perfis = new Map();
  const repo = {
    perfis: {
      async salvar(p) { perfis.set(p.key, { ...perfis.get(p.key), ...p }); },
      async obter(k) { return perfis.get(k); },
    },
  };
  const api = {
    runtime: { getURL: (p) => `chrome-extension://abc/${p}` },
    tabs: {
      query: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 7 }),
      update: vi.fn().mockResolvedValue({ id: 7 }),
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  };
  return { perfis, repo, api, roteador: criarRoteador(api, { abrirRepo: async () => repo }) };
}

const cargaDeFeed = {
  url: "https://www.instagram.com/graphql/query",
  metodo: "POST",
  headers: { "x-ig-app-id": "936619743392459", cookie: "sessionid=SEGREDO" },
  corpo: "doc_id=1&variables=%7B%22after%22%3Anull%7D",
  json: { data: {} },
};

describe("catalogo", () => {
  it("responde com o estado do perfil pedido", async () => {
    const env = ambiente();
    await env.repo.perfis.salvar({ key: "ig:@f", totalIndexado: 1240, completo: false });
    const r = await env.roteador.aoReceberMensagem({ tipo: "catalogo", profileKey: "ig:@f" }, {});
    expect(r).toEqual({ totalIndexado: 1240, completo: false });
  });

  it("responde catálogo vazio para perfil nunca indexado", async () => {
    const env = ambiente();
    const r = await env.roteador.aoReceberMensagem({ tipo: "catalogo", profileKey: "ig:@novo" }, {});
    expect(r).toEqual({ totalIndexado: 0, completo: false });
  });
});

describe("captura da assinatura", () => {
  it("grava a assinatura no banco mesmo com a aba do Acervo fechada", async () => {
    const env = ambiente();
    env.api.tabs.query.mockResolvedValue([]); // Acervo não está aberto

    await env.roteador.aoReceberMensagem(
      { tipo: "capturou", profileKey: "ig:@f", carga: cargaDeFeed },
      { tab: { id: 9 } },
    );

    const perfil = await env.repo.perfis.obter("ig:@f");
    expect(perfil.assinatura.url).toContain("/graphql/query");
    expect(perfil.assinatura.paramCursor).toBe("after");
  });

  it("nunca guarda cookie junto com a assinatura", async () => {
    const env = ambiente();
    await env.roteador.aoReceberMensagem(
      { tipo: "capturou", profileKey: "ig:@f", carga: cargaDeFeed },
      { tab: { id: 9 } },
    );
    const perfil = await env.repo.perfis.obter("ig:@f");
    expect(JSON.stringify(perfil)).not.toContain("SEGREDO");
  });

  it("ignora captura de resposta que não é de feed", async () => {
    const env = ambiente();
    await env.roteador.aoReceberMensagem(
      { tipo: "capturou", profileKey: "ig:@f", carga: { url: "https://cdn.test/a.mp4" } },
      { tab: { id: 9 } },
    );
    expect(await env.repo.perfis.obter("ig:@f")).toBeUndefined();
  });

  it("ainda repassa a captura para a aba do Acervo quando ela está aberta", async () => {
    const env = ambiente();
    env.api.tabs.query.mockResolvedValue([{ id: 42 }]);
    await env.roteador.aoReceberMensagem(
      { tipo: "capturou", profileKey: "ig:@f", carga: cargaDeFeed },
      { tab: { id: 9 } },
    );
    expect(env.api.tabs.sendMessage).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ tipo: "capturou", abaDeOrigem: 9 }),
    );
  });
});
