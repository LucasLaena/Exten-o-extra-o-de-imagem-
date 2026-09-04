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
