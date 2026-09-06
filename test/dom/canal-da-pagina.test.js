import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  criarCanalDaPagina, PEDIDO, RESPOSTA,
} from "../../src/content/canal-da-pagina.js";

/** Faz o papel do capturador do mundo MAIN. */
function capturadorDeMentira(capturas) {
  const aoPedir = (evento) => {
    window.dispatchEvent(
      new CustomEvent(RESPOSTA, {
        detail: { id: evento.detail.id, capturas },
      }),
    );
  };
  window.addEventListener(PEDIDO, aoPedir);
  return () => window.removeEventListener(PEDIDO, aoPedir);
}

beforeEach(() => {
  window.scrollBy = vi.fn();
});

describe("a página como canal", () => {
  it("pede as capturas ao capturador e devolve o que ele viu", async () => {
    const parar = capturadorDeMentira([{ url: "https://x.test/graphql/query" }]);
    const canal = criarCanalDaPagina();

    const capturas = await canal.drenar();

    expect(capturas).toHaveLength(1);
    expect(capturas[0].url).toContain("graphql");
    parar();
  });

  it("cada pedido só aceita a sua resposta", async () => {
    // Duas coletas ao mesmo tempo nao podem trocar de resposta entre si.
    const aoPedir = (evento) => {
      window.dispatchEvent(
        new CustomEvent(RESPOSTA, { detail: { id: "outro-pedido", capturas: [1, 2] } }),
      );
      window.dispatchEvent(
        new CustomEvent(RESPOSTA, { detail: { id: evento.detail.id, capturas: ["meu"] } }),
      );
    };
    window.addEventListener(PEDIDO, aoPedir);

    const canal = criarCanalDaPagina();
    expect(await canal.drenar()).toEqual(["meu"]);

    window.removeEventListener(PEDIDO, aoPedir);
  });

  it("sem capturador do outro lado, desiste em vez de travar", async () => {
    const canal = criarCanalDaPagina({ esperaMs: 20 });
    expect(await canal.drenar()).toEqual([]);
  });

  it("o cutucão rola de verdade: aqui a página está renderizada", async () => {
    const canal = criarCanalDaPagina();
    await canal.cutucar();
    expect(window.scrollBy).toHaveBeenCalled();
    expect(window.scrollBy.mock.calls[0][0].top).toBeGreaterThan(0);
  });

  it("página que recusa rolar não derruba a coleta", async () => {
    window.scrollBy = () => { throw new Error("bloqueado"); };
    const canal = criarCanalDaPagina();
    await expect(canal.cutucar()).resolves.toBeUndefined();
  });

  it("busca do mesmo domínio, levando a sessão junto", async () => {
    const fetchFalso = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const canal = criarCanalDaPagina({ janela: { ...window, fetch: fetchFalso } });

    await canal.buscar("https://www.instagram.com/graphql/query", { method: "POST" });

    const [, init] = fetchFalso.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
  });

  it("não há aba para fechar: a página é do usuário", async () => {
    const canal = criarCanalDaPagina();
    await expect(canal.fechar()).resolves.toBeUndefined();
  });
});

describe("quando a extensao foi recarregada", () => {
  const janelaQueFalha = (motivo) => ({
    ...window,
    fetch: vi.fn().mockRejectedValue(new TypeError(motivo)),
    addEventListener: () => {},
    removeEventListener: () => {},
  });

  it("troca 'Failed to fetch' por instrucao quando a copia ficou orfa", async () => {
    const canal = criarCanalDaPagina({
      janela: janelaQueFalha("Failed to fetch"),
      api: { runtime: {} },
    });

    const erro = await canal.buscar("https://www.instagram.com/graphql/query").catch((e) => e);

    expect(erro.name).toBe("ErroDeExtensaoMorta");
    expect(erro.message).toMatch(/F5|recarregue a página/i);
  });

  it("erro de rede de verdade sobe como veio, com a extensao viva", async () => {
    // Confundir os dois foi o que custou a rodada: a mensagem tem de apontar
    // para a causa certa.
    const canal = criarCanalDaPagina({
      janela: janelaQueFalha("NetworkError"),
      api: { runtime: { id: "acervo-de-mentira" } },
    });

    const erro = await canal.buscar("https://www.instagram.com/graphql/query").catch((e) => e);

    expect(erro.name).not.toBe("ErroDeExtensaoMorta");
    expect(erro.message).toContain("NetworkError");
  });
});
