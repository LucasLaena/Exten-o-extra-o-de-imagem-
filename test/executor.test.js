import { describe, it, expect, vi } from "vitest";
import { criarExecutor, ErroDeAba } from "../src/acervo/executor.js";

function apiFalsa(sobrescrever = {}) {
  return {
    scripting: {
      executeScript: vi.fn().mockResolvedValue([{ result: "ok" }]),
    },
    tabs: {
      query: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 5, status: "loading" }),
      get: vi.fn().mockResolvedValue({ id: 5, status: "complete" }),
      update: vi.fn().mockResolvedValue({ id: 5 }),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    ...sobrescrever,
  };
}

const semEspera = () => Promise.resolve();

describe("rodar", () => {
  it("executa a função na aba pedida, no mundo MAIN", async () => {
    const api = apiFalsa();
    const ex = criarExecutor(api, { esperar: semEspera });
    const fn = (a) => a;

    const r = await ex.rodar(9, fn, ["arg"]);

    expect(r).toBe("ok");
    const chamada = api.scripting.executeScript.mock.calls[0][0];
    expect(chamada.target).toEqual({ tabId: 9 });
    expect(chamada.world).toBe("MAIN");
    expect(chamada.func).toBe(fn);
    expect(chamada.args).toEqual(["arg"]);
  });

  it("devolve o resultado do primeiro frame, não o array cru", async () => {
    const api = apiFalsa();
    api.scripting.executeScript.mockResolvedValue([{ result: { total: 42 } }]);
    const ex = criarExecutor(api, { esperar: semEspera });
    expect(await ex.rodar(9, () => {})).toEqual({ total: 42 });
  });

  it("transforma falha de injeção num erro que diz o que fazer", async () => {
    const api = apiFalsa();
    api.scripting.executeScript.mockRejectedValue(
      new Error("Cannot access contents of the page"),
    );
    const ex = criarExecutor(api, { esperar: semEspera });

    await expect(ex.rodar(9, () => {})).rejects.toBeInstanceOf(ErroDeAba);
    await expect(ex.rodar(9, () => {})).rejects.toThrow(/aba do perfil/i);
    // O prefixo carimba a versão, para erro antigo não se passar por novo.
    await expect(ex.rodar(9, () => {})).rejects.toThrow(/^\[v/);
  });

  it("explica quando a aba sumiu", async () => {
    const api = apiFalsa();
    api.scripting.executeScript.mockRejectedValue(new Error("No tab with id: 9"));
    const ex = criarExecutor(api, { esperar: semEspera });
    await expect(ex.rodar(9, () => {})).rejects.toThrow(/foi fechada/i);
  });

  it("trata resultado vazio como erro, não como sucesso silencioso", async () => {
    const api = apiFalsa();
    api.scripting.executeScript.mockResolvedValue([]);
    const ex = criarExecutor(api, { esperar: semEspera });
    await expect(ex.rodar(9, () => {})).rejects.toThrow(/sem resultado/i);
  });
});

describe("acharOuAbrirAba", () => {
  it("reusa a aba do perfil já aberta", async () => {
    const api = apiFalsa();
    api.tabs.query.mockResolvedValue([{ id: 7, url: "https://www.instagram.com/fulano/" }]);
    const ex = criarExecutor(api, { esperar: semEspera });

    const r = await ex.acharOuAbrirAba("https://www.instagram.com/fulano/");

    expect(r).toEqual({ abaId: 7, criada: false });
    expect(api.tabs.create).not.toHaveBeenCalled();
  });

  it("abre uma aba de fundo quando não há nenhuma", async () => {
    const api = apiFalsa();
    const ex = criarExecutor(api, { esperar: semEspera });

    const r = await ex.acharOuAbrirAba("https://www.instagram.com/fulano/");

    // Nasce visivel: aba escondida nao carrega o feed continuo.
    expect(api.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://www.instagram.com/fulano/", active: true }),
    );
    expect(r).toEqual({ abaId: 5, criada: true });
  });

  it("espera a aba terminar de carregar antes de devolver", async () => {
    const api = apiFalsa();
    api.tabs.get
      .mockResolvedValueOnce({ id: 5, status: "loading" })
      .mockResolvedValueOnce({ id: 5, status: "loading" })
      .mockResolvedValue({ id: 5, status: "complete" });
    const ex = criarExecutor(api, { esperar: semEspera });

    await ex.acharOuAbrirAba("https://www.instagram.com/fulano/");
    expect(api.tabs.get).toHaveBeenCalledTimes(3);
  });

  it("desiste de esperar em vez de travar para sempre", async () => {
    const api = apiFalsa();
    api.tabs.get.mockResolvedValue({ id: 5, status: "loading" });
    const ex = criarExecutor(api, { esperar: semEspera, tentativasDeCarga: 3 });
    await expect(ex.acharOuAbrirAba("https://x.test/")).rejects.toThrow(/não terminou de carregar/i);
  });

  it("casa a aba pelo perfil, ignorando query string", async () => {
    const api = apiFalsa();
    api.tabs.query.mockResolvedValue([
      { id: 7, url: "https://www.instagram.com/fulano/?hl=pt" },
    ]);
    const ex = criarExecutor(api, { esperar: semEspera });
    expect(await ex.acharOuAbrirAba("https://www.instagram.com/fulano/")).toEqual({
      abaId: 7, criada: false,
    });
  });

  it("aceita abrir escondida quando pedido", async () => {
    const api = apiFalsa();
    const ex = criarExecutor(api, { esperar: semEspera });
    await ex.acharOuAbrirAba("https://x.test/", { visivel: false });
    expect(api.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
  });
});

describe("fecharSeCriada", () => {
  it("fecha só a aba que ele mesmo abriu", async () => {
    const api = apiFalsa();
    const ex = criarExecutor(api, { esperar: semEspera });

    await ex.fecharSeCriada({ abaId: 5, criada: true });
    expect(api.tabs.remove).toHaveBeenCalledWith(5);

    api.tabs.remove.mockClear();
    await ex.fecharSeCriada({ abaId: 7, criada: false });
    expect(api.tabs.remove).not.toHaveBeenCalled();
  });

  it("não explode se a aba já sumiu", async () => {
    const api = apiFalsa();
    api.tabs.remove.mockRejectedValue(new Error("No tab with id"));
    const ex = criarExecutor(api, { esperar: semEspera });
    await expect(ex.fecharSeCriada({ abaId: 5, criada: true })).resolves.toBeUndefined();
  });
});

describe("ativar e restaurar", () => {
  it("traz a aba para frente e informa qual estava ativa", async () => {
    const api = apiFalsa();
    api.tabs.query.mockResolvedValue([{ id: 3, active: true }]);
    const ex = criarExecutor(api, { esperar: semEspera });

    const anterior = await ex.ativar(9);

    expect(anterior).toBe(3);
    expect(api.tabs.update).toHaveBeenCalledWith(9, { active: true });
  });

  it("devolve o foco para a aba anterior", async () => {
    const api = apiFalsa();
    const ex = criarExecutor(api, { esperar: semEspera });
    await ex.restaurar(3);
    expect(api.tabs.update).toHaveBeenCalledWith(3, { active: true });
  });

  it("não faz nada quando não havia aba anterior", async () => {
    const api = apiFalsa();
    const ex = criarExecutor(api, { esperar: semEspera });
    await ex.restaurar(null);
    expect(api.tabs.update).not.toHaveBeenCalled();
  });

  it("perder o foco não derruba a coleta", async () => {
    const api = apiFalsa();
    api.tabs.update.mockRejectedValue(new Error("janela fechada"));
    const ex = criarExecutor(api, { esperar: semEspera });
    await expect(ex.ativar(9)).resolves.toBeDefined();
    await expect(ex.restaurar(3)).resolves.toBeUndefined();
  });
});
