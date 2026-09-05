import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PADROES_DE_FEED } from "../../src/core/assinatura.js";

const URL_FEED = "https://www.instagram.com/graphql/query";
const URL_OUTRA = "https://www.instagram.com/ajax/qualquer/";

const respostaJson = (corpo) =>
  new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });

const fetchFalso = vi.fn();
const drenar = async () => {
  // A captura é guardada depois que o clone termina de ler o corpo.
  await new Promise((r) => setTimeout(r, 10));
  const c = window.__acervo_capturas__;
  window.__acervo_capturas__ = [];
  return c;
};

beforeAll(async () => {
  window.fetch = fetchFalso;
  await import("../../src/page/captura.js");
});

beforeEach(async () => {
  await drenar();
  fetchFalso.mockReset();
  fetchFalso.mockResolvedValue(respostaJson({ ok: true }));
});

describe("captura", () => {
  it("instala uma vez só", async () => {
    const antes = window.fetch;
    await import("../../src/page/captura.js");
    expect(window.fetch).toBe(antes);
    expect(window.__acervo_captura__.instalado).toBe(true);
  });

  it("guarda a resposta de um endpoint de feed no buffer", async () => {
    fetchFalso.mockResolvedValue(respostaJson({ data: { x: 1 } }));
    await window.fetch(URL_FEED, { method: "POST", body: "a=1" });
    const [c] = await drenar();
    expect(c.url).toContain("/graphql/query");
    expect(c.metodo).toBe("POST");
    expect(c.json).toEqual({ data: { x: 1 } });
    expect(c.em).toBeTypeOf("number");
  });

  it("ignora url que não é de feed", async () => {
    await window.fetch(URL_OUTRA);
    expect(await drenar()).toHaveLength(0);
  });

  it("devolve ao app uma resposta ainda legível", async () => {
    fetchFalso.mockResolvedValue(respostaJson({ importante: true }));
    const r = await window.fetch(URL_FEED);
    expect(await r.json()).toEqual({ importante: true });
  });

  it("não engole o erro do app", async () => {
    fetchFalso.mockRejectedValue(new Error("rede caiu"));
    await expect(window.fetch(URL_FEED)).rejects.toThrow("rede caiu");
  });

  it("não quebra com resposta que não é JSON", async () => {
    fetchFalso.mockResolvedValue(new Response("<html>", { status: 200 }));
    await expect(window.fetch(URL_FEED)).resolves.toBeInstanceOf(Response);
    expect(await drenar()).toHaveLength(0);
  });

  it("limita o buffer para não virar vazamento", async () => {
    for (let i = 0; i < 60; i++) await window.fetch(URL_FEED);
    await new Promise((r) => setTimeout(r, 20));
    expect(window.__acervo_capturas__.length).toBeLessThanOrEqual(50);
    window.__acervo_capturas__ = [];
  });

  it("nunca toca em cookie nem envia mensagem", () => {
    // Sem os comentários: eles citam postMessage justamente para explicar
    // que a cadeia de mensagens foi removida.
    const codigo = readFileSync("src/page/captura.js", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/document\.cookie/);
    expect(codigo).not.toMatch(/postMessage/);
    expect(codigo).not.toMatch(/chrome\.runtime/);
  });

  it("carrega os mesmos padrões de feed do core", () => {
    const fonte = readFileSync("src/page/captura.js", "utf8");
    for (const p of PADROES_DE_FEED) expect(fonte).toContain(p.source);
  });
});

describe("o corpo da consulta", () => {
  // Sem o corpo nao ha doc_id nem variables, e a consulta repetida de fora
  // chega vazia ao Instagram, que responde 500. Foi exatamente o que
  // aconteceu na v0.21.0.
  it("le o corpo de dentro do Request, e nao so de init", async () => {
    fetchFalso.mockResolvedValue(respostaJson({ data: { x: 1 } }));
    const pedido = new Request(URL_FEED, {
      method: "POST",
      body: "doc_id=987&variables=%7B%22id%22%3A%221%22%7D",
    });

    await window.fetch(pedido);

    const [c] = await drenar();
    expect(c.corpo).toContain("doc_id=987");
    expect(c.corpo).toContain("variables=");
  });

  it("aceita URLSearchParams como corpo", async () => {
    fetchFalso.mockResolvedValue(respostaJson({ data: { x: 1 } }));
    await window.fetch(URL_FEED, {
      method: "POST",
      body: new URLSearchParams({ doc_id: "555" }),
    });

    const [c] = await drenar();
    expect(c.corpo).toBe("doc_id=555");
  });

  it("nunca deixa o corpo virar [object Object]", async () => {
    fetchFalso.mockResolvedValue(respostaJson({ data: { x: 1 } }));
    const forma = new FormData();
    forma.append("doc_id", "42");

    await window.fetch(URL_FEED, { method: "POST", body: forma });

    const [c] = await drenar();
    expect(c.corpo).not.toContain("[object");
    expect(c.corpo).toContain("doc_id=42");
  });

  it("guarda os cabecalhos que o endpoint exige", async () => {
    fetchFalso.mockResolvedValue(respostaJson({ data: { x: 1 } }));
    await window.fetch(URL_FEED, {
      method: "POST",
      headers: { "X-IG-App-ID": "936619743392459" },
      body: "doc_id=1",
    });

    const [c] = await drenar();
    expect(c.headers["x-ig-app-id"]).toBe("936619743392459");
  });
});

describe("captura por XHR", () => {
  // Este caminho guardava so url, metodo e json. Sem corpo nao ha doc_id, a
  // assinatura e recusada, e o aprendiz dizia "a pagina nao consultou o feed"
  // justamente quando ela tinha consultado.
  //
  // Os metodos remendados sao chamados direto sobre um objeto de mentira: um
  // XHR de verdade tentaria falar com a instagram.com, e o teste passaria a
  // depender da rede para provar algo que e so de contabilidade interna.
  function xhrDeMentira(resposta) {
    return {
      ouvintes: {},
      responseText: JSON.stringify(resposta),
      addEventListener(tipo, fn) {
        (this.ouvintes[tipo] = this.ouvintes[tipo] ?? []).push(fn);
      },
      dispara(tipo) {
        for (const fn of this.ouvintes[tipo] ?? []) fn();
      },
    };
  }

  // Cada metodo remendado faz a sua escrituracao ANTES de delegar ao
  // original, e o original do jsdom recusa um objeto que nao e XHR de
  // verdade. A recusa e esperada: o que interessa ja foi anotado.
  const semRede = (fn) => {
    try { fn(); } catch { /* o envio de verdade nao existe aqui */ }
  };

  function enviar(url, corpo, cabecalhos = {}) {
    const x = xhrDeMentira({ data: { x: 1 } });
    semRede(() => XMLHttpRequest.prototype.open.call(x, "POST", url));
    for (const nome of Object.keys(cabecalhos)) {
      semRede(() =>
        XMLHttpRequest.prototype.setRequestHeader.call(x, nome, cabecalhos[nome]));
    }
    semRede(() => XMLHttpRequest.prototype.send.call(x, corpo));
    x.dispara("load");
    return x;
  }

  it("guarda o corpo, que e onde mora o doc_id", async () => {
    enviar(URL_FEED, "doc_id=321&variables=%7B%7D");
    const [c] = await drenar();
    expect(c).toBeTruthy();
    expect(c.corpo).toContain("doc_id=321");
  });

  it("guarda os cabecalhos que o endpoint exige", async () => {
    enviar(URL_FEED, "doc_id=1", { "X-IG-App-ID": "936619743392459" });
    const [c] = await drenar();
    expect(c.headers["x-ig-app-id"]).toBe("936619743392459");
  });

  it("guarda tambem a resposta, para a primeira pagina sair de graca", async () => {
    enviar(URL_FEED, "doc_id=1");
    const [c] = await drenar();
    expect(c.json).toEqual({ data: { x: 1 } });
  });

  it("ignora endpoint que nao e de feed", async () => {
    enviar(URL_OUTRA, "doc_id=1");
    expect(await drenar()).toHaveLength(0);
  });
});
