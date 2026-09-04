import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { instalarPonte } from "../../src/content/app.js";

let chromeApi;
let desinstalar;

beforeEach(() => {
  chromeApi = {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      onMessage: {
        _ouvintes: [],
        addListener(fn) { this._ouvintes.push(fn); },
        removeListener(fn) { this._ouvintes = this._ouvintes.filter((f) => f !== fn); },
        disparar(msg) {
          return new Promise((resolve) => {
            for (const fn of this._ouvintes) fn(msg, {}, resolve);
          });
        },
      },
    },
  };
  desinstalar = instalarPonte({ chromeApi });
});

afterEach(() => { desinstalar?.(); });

describe("do hook para o service worker", () => {
  it("encaminha a captura do hook", async () => {
    window.postMessage({
      fonte: "acervo/pagina",
      tipo: "capturou",
      carga: { url: "https://www.instagram.com/graphql/query", json: { a: 1 } },
    }, "*");

    await new Promise((r) => setTimeout(r, 10));
    expect(chromeApi.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "capturou" }),
    );
  });

  it("ignora mensagem de outra fonte na página", async () => {
    window.postMessage({ fonte: "outro-plugin", tipo: "capturou", carga: {} }, "*");
    await new Promise((r) => setTimeout(r, 10));
    expect(chromeApi.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

describe("do service worker para o hook", () => {
  it("repassa o pedido de paginação e devolve a resposta do hook", async () => {
    const resposta = chromeApi.runtime.onMessage.disparar({
      tipo: "paginar", id: "req-7", url: "https://feed.test", init: {},
    });

    // a ponte deve ter postado para o hook
    const pedido = await new Promise((resolve) => {
      const ouvir = (ev) => {
        if (ev.data?.fonte === "acervo/conteudo" && ev.data?.tipo === "paginar") {
          window.removeEventListener("message", ouvir);
          resolve(ev.data);
        }
      };
      window.addEventListener("message", ouvir);
    });
    expect(pedido.id).toBe("req-7");

    // e deve resolver quando o hook responder com o mesmo id
    window.postMessage({
      fonte: "acervo/pagina", tipo: "pagina", id: "req-7",
      ok: true, status: 200, json: { pagina: 1 },
    }, "*");

    await expect(resposta).resolves.toEqual(
      expect.objectContaining({ ok: true, json: { pagina: 1 } }),
    );
  });

  it("ignora resposta do hook com id de outro pedido", async () => {
    const resposta = chromeApi.runtime.onMessage.disparar({
      tipo: "paginar", id: "certo", url: "https://feed.test", init: {},
    });

    window.postMessage({ fonte: "acervo/pagina", tipo: "pagina", id: "errado", ok: true }, "*");
    const venceu = await Promise.race([
      resposta.then(() => "resolveu"),
      new Promise((r) => setTimeout(() => r("continua esperando"), 60)),
    ]);
    expect(venceu).toBe("continua esperando");
  });
});
