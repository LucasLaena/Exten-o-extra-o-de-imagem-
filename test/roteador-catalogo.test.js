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
