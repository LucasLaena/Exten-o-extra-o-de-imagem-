import { describe, it, expect, vi } from "vitest";
import { abrirCanal } from "../src/acervo/canal.js";
import { buscarJson, drenarCapturas } from "../src/acervo/sondas.js";

function executorFalso(resultado = { ok: true, status: 200, json: { a: 1 } }) {
  return {
    acharOuAbrirAba: vi.fn().mockResolvedValue({ abaId: 5, criada: true }),
    fecharSeCriada: vi.fn().mockResolvedValue(undefined),
    rodar: vi.fn(async (_aba, func) => (func === drenarCapturas ? [] : resultado)),
  };
}

const abrir = (executor) =>
  abrirCanal({ executor, urlDoPerfil: "https://www.instagram.com/fulano/" });

describe("canal por aba escondida", () => {
  it("abre em segundo plano: a tela do usuário não é tomada", async () => {
    const ex = executorFalso();
    await abrir(ex);
    expect(ex.acharOuAbrirAba).toHaveBeenCalledWith(
      "https://www.instagram.com/fulano/",
      { visivel: false },
    );
  });

  it("busca de dentro da página, onde a requisição é do mesmo domínio", async () => {
    const ex = executorFalso();
    const canal = await abrir(ex);

    const r = await canal.buscar("https://www.instagram.com/graphql/query", {
      method: "POST", body: "doc_id=1",
    });

    expect(ex.rodar).toHaveBeenCalledWith(5, buscarJson, [
      "https://www.instagram.com/graphql/query",
      { method: "POST", body: "doc_id=1" },
    ]);
    expect(r.ok).toBe(true);
    expect(JSON.parse(await r.text())).toEqual({ a: 1 });
  });

  it("responde como fetch responde, para o coletor não saber a diferença", async () => {
    const canal = await abrir(executorFalso({ ok: false, status: 429, json: null }));
    const r = await canal.buscar("https://x.test/");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(429);
  });

  it("200 sem json não é sucesso: é a página do site no lugar dos dados", async () => {
    const canal = await abrir(executorFalso({ ok: false, status: 200, json: null }));
    const r = await canal.buscar("https://x.test/");
    expect(r.ok).toBe(false);
  });

  it("repassa o motivo cru quando a requisição nem sai", async () => {
    const canal = await abrir(
      executorFalso({ ok: false, status: 0, json: null, erro: "NetworkError" }),
    );
    const r = await canal.buscar("https://x.test/");
    expect(await r.text()).toBe("NetworkError");
  });

  it("fecha só a aba que abriu", async () => {
    const ex = executorFalso();
    const canal = await abrir(ex);
    await canal.fechar();
    expect(ex.fecharSeCriada).toHaveBeenCalledWith({ abaId: 5, criada: true });
  });
});
