import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PADROES_DE_FEED } from "../../src/core/assinatura.js";

const URL_FEED = "https://www.instagram.com/graphql/query";
const URL_OUTRA = "https://www.instagram.com/ajax/qualquer/";

function respostaJson(corpo) {
  return new Response(JSON.stringify(corpo), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Espera a próxima mensagem do hook que case com o tipo. */
function proximaMensagem(tipo, timeout = 1000) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      window.removeEventListener("message", ouvir);
      reject(new Error(`sem mensagem "${tipo}" em ${timeout}ms`));
    }, timeout);
    function ouvir(ev) {
      if (ev.data?.fonte === "acervo/pagina" && ev.data?.tipo === tipo) {
        clearTimeout(id);
        window.removeEventListener("message", ouvir);
        resolve(ev.data);
      }
    }
    window.addEventListener("message", ouvir);
  });
}

// O hook instala ouvintes no window. Reimportá-lo a cada teste acumularia
// ouvintes de instâncias antigas — que responderiam com mocks velhos e
// venceriam a corrida. Instala uma vez; cada teste só troca o comportamento
// do mock, que é o mesmo objeto capturado como fetchOriginal.
const fetchFalso = vi.fn();

beforeAll(async () => {
  window.fetch = fetchFalso;
  await import("../../src/page/hook.js");
});

beforeEach(async () => {
  // A captura é anunciada de forma assíncrona, depois que o fetch já resolveu.
  // Sem drenar, a mensagem de um teste chega no seguinte e o confunde.
  await new Promise((r) => setTimeout(r, 10));
  fetchFalso.mockReset();
  fetchFalso.mockResolvedValue(respostaJson({ ok: true }));
});

describe("instalação", () => {
  it("substitui o fetch e guarda o original", () => {
    expect(window.fetch).not.toBe(fetchFalso);
    expect(window.__acervo_hook__.instalado).toBe(true);
    expect(window.__acervo_hook__.fetchOriginal).toBeTypeOf("function");
  });

  it("não instala duas vezes", async () => {
    const depoisDaPrimeira = window.fetch;
    await import("../../src/page/hook.js");
    expect(window.fetch).toBe(depoisDaPrimeira);
  });
});

describe("captura", () => {
  it("anuncia a resposta de um endpoint de feed", async () => {
    fetchFalso.mockResolvedValue(respostaJson({ data: { x: 1 } }));
    const esperando = proximaMensagem("capturou");
    await window.fetch(URL_FEED, { method: "POST", body: "doc_id=1" });
    const msg = await esperando;
    expect(msg.carga.url).toContain("/graphql/query");
    expect(msg.carga.metodo).toBe("POST");
    expect(msg.carga.corpo).toBe("doc_id=1");
    expect(msg.carga.json).toEqual({ data: { x: 1 } });
  });

  it("copia os headers do request", async () => {
    const esperando = proximaMensagem("capturou");
    await window.fetch(URL_FEED, {
      method: "POST",
      headers: { "X-IG-App-ID": "936619743392459" },
      body: "a=1",
    });
    const msg = await esperando;
    expect(msg.carga.headers["x-ig-app-id"]).toBe("936619743392459");
  });

  it("ignora url que não é de feed", async () => {
    const nada = proximaMensagem("capturou", 120).then(() => "veio").catch(() => "nada");
    await window.fetch(URL_OUTRA);
    expect(await nada).toBe("nada");
  });

  it("devolve ao app uma resposta ainda legível", async () => {
    fetchFalso.mockResolvedValue(respostaJson({ importante: true }));
    const resposta = await window.fetch(URL_FEED);
    // Se o hook tivesse consumido o corpo em vez de clonar, isto lançaria.
    expect(await resposta.json()).toEqual({ importante: true });
  });

  it("aceita Request como primeiro argumento", async () => {
    const esperando = proximaMensagem("capturou");
    await window.fetch(new Request(URL_FEED, { method: "POST", body: "b=2" }));
    const msg = await esperando;
    expect(msg.carga.url).toContain("/graphql/query");
    expect(msg.carga.metodo).toBe("POST");
  });

  it("não engole o erro do app quando o fetch falha", async () => {
    fetchFalso.mockRejectedValue(new Error("rede caiu"));
    await expect(window.fetch(URL_FEED)).rejects.toThrow("rede caiu");
  });

  it("não quebra quando a resposta não é JSON", async () => {
    fetchFalso.mockResolvedValue(new Response("<html>", { status: 200 }));
    await expect(window.fetch(URL_FEED)).resolves.toBeInstanceOf(Response);
  });

  it("nunca toca em cookie", () => {
    const fonte = readFileSync("src/page/hook.js", "utf8");
    expect(fonte).not.toMatch(/document\.cookie/);
    expect(fonte.toLowerCase()).not.toMatch(/\bsessionid\b/);
  });
});

describe("paginação sob comando", () => {
  it("executa o request pedido e devolve o JSON", async () => {
    fetchFalso.mockResolvedValue(respostaJson({ pagina: 2 }));
    const esperando = proximaMensagem("pagina");
    window.postMessage({
      fonte: "acervo/conteudo",
      tipo: "paginar",
      id: "req-1",
      url: URL_FEED,
      init: { method: "POST", body: "a=1", credentials: "include" },
    }, "*");

    const msg = await esperando;
    expect(msg.id).toBe("req-1");
    expect(msg.ok).toBe(true);
    expect(msg.status).toBe(200);
    expect(msg.json).toEqual({ pagina: 2 });
  });

  it("usa o fetch original, para não capturar o próprio request", async () => {
    const esperando = proximaMensagem("pagina");
    window.postMessage({
      fonte: "acervo/conteudo", tipo: "paginar", id: "r", url: URL_FEED, init: {},
    }, "*");
    await esperando;
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it("reporta status de bloqueio em vez de fingir sucesso", async () => {
    fetchFalso.mockResolvedValue(new Response("", { status: 429 }));
    const esperando = proximaMensagem("pagina");
    window.postMessage({
      fonte: "acervo/conteudo", tipo: "paginar", id: "r", url: URL_FEED, init: {},
    }, "*");
    const msg = await esperando;
    expect(msg.ok).toBe(false);
    expect(msg.status).toBe(429);
  });

  it("reporta a falha de rede", async () => {
    fetchFalso.mockRejectedValue(new Error("offline"));
    const esperando = proximaMensagem("pagina");
    window.postMessage({
      fonte: "acervo/conteudo", tipo: "paginar", id: "r", url: URL_FEED, init: {},
    }, "*");
    const msg = await esperando;
    expect(msg.ok).toBe(false);
    expect(msg.erro).toContain("offline");
  });

  it("ignora mensagem de outra fonte", async () => {
    const nada = proximaMensagem("pagina", 120).then(() => "veio").catch(() => "nada");
    window.postMessage({ fonte: "outro-plugin", tipo: "paginar", id: "x", url: URL_FEED }, "*");
    expect(await nada).toBe("nada");
  });
});

describe("repetir a última captura", () => {
  it("reanuncia a captura guardada quando o content script pede", async () => {
    // O hook entra em document_start e o content script só em document_idle.
    // A primeira busca de feed acontece no meio, sem ninguém ouvindo — então o
    // hook guarda a última e reanuncia quando a ponte finalmente sobe.
    fetchFalso.mockResolvedValue(respostaJson({ data: { primeira: true } }));
    const primeira = proximaMensagem("capturou");
    await window.fetch(URL_FEED, { method: "POST", body: "doc_id=1" });
    await primeira;

    const repetida = proximaMensagem("capturou");
    window.postMessage({ fonte: "acervo/conteudo", tipo: "pedirUltimaCaptura" }, "*");
    const msg = await repetida;

    expect(msg.carga.json).toEqual({ data: { primeira: true } });
    expect(msg.carga.corpo).toBe("doc_id=1");
  });
});

describe("sincronia com o módulo de assinatura", () => {
  it("o hook carrega os mesmos padrões de feed do core", () => {
    const fonte = readFileSync("src/page/hook.js", "utf8");
    for (const padrao of PADROES_DE_FEED) {
      expect(fonte).toContain(padrao.source);
    }
  });
});
