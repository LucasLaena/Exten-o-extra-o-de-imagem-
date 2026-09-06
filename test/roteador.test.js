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

describe("guardar o que a pagina coletou", () => {
  // A coleta acontece na pagina do Instagram e vive na memoria daquela aba.
  // O Acervo tem banco proprio: sem esta passagem, catalogar dava certo e a
  // grade continuava vazia.
  function bancoFalso() {
    const posts = [];
    const perfis = new Map();
    return {
      posts: {
        limparTudo: vi.fn(async () => { posts.length = 0; }),
        salvarLote: vi.fn(async (lote) => { posts.push(...lote); }),
        todos: () => posts,
      },
      perfis: {
        salvar: vi.fn(async (p) => { perfis.set(p.key, p); }),
        obter: async (k) => perfis.get(k),
      },
    };
  }

  const guardar = (banco, mensagem) =>
    criarRoteador(apiFalsa(), { abrirRepo: async () => banco }).aoReceberMensagem({
      tipo: "guardarPosts",
      profileKey: "ig:@jorgekotz",
      ...mensagem,
    });

  it("guarda os posts onde a grade consegue le-los", async () => {
    const banco = bancoFalso();
    const r = await guardar(banco, {
      posts: [{ key: "a", seq: 1 }, { key: "b", seq: 2 }],
      total: 2565,
      completo: false,
    });

    expect(r).toEqual({ guardados: 2 });
    expect(banco.posts.todos()).toHaveLength(2);
  });

  it("substitui em vez de somar: catalogar de novo comeca do zero", async () => {
    const banco = bancoFalso();
    await guardar(banco, { posts: [{ key: "velho" }] });
    await guardar(banco, { posts: [{ key: "novo" }] });

    expect(banco.posts.limparTudo).toHaveBeenCalledTimes(2);
    expect(banco.posts.todos().map((p) => p.key)).toEqual(["novo"]);
  });

  it("anota o perfil, para a tela saber quanto foi e quanto falta", async () => {
    const banco = bancoFalso();
    await guardar(banco, {
      posts: [{ key: "a" }],
      total: 2565,
      completo: true,
    });

    const perfil = await banco.perfis.obter("ig:@jorgekotz");
    expect(perfil.totalIndexado).toBe(1);
    expect(perfil.totalDeclarado).toBe(2565);
    expect(perfil.completo).toBe(true);
  });

  it("coleta vazia nao explode, e ainda assim zera o que havia", async () => {
    const banco = bancoFalso();
    await guardar(banco, { posts: [] });

    expect(banco.posts.limparTudo).toHaveBeenCalled();
    expect(banco.posts.salvarLote).not.toHaveBeenCalled();
  });
});
