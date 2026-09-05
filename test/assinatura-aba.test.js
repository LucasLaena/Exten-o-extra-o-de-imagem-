import { describe, it, expect, vi } from "vitest";
import { criarAprendiz, ErroDeAssinatura } from "../src/acervo/assinatura-aba.js";
import { instagram } from "../src/adapters/instagram.js";

const GRAPHQL = "https://www.instagram.com/graphql/query";

const capturaBoa = (dono = "777") => ({
  url: GRAPHQL,
  metodo: "POST",
  headers: { "x-ig-app-id": "936619743392459", "x-csrftoken": "T0K3N", cookie: "sessionid=x" },
  corpo: "doc_id=123&variables=%7B%22id%22%3A%22777%22%7D",
  json: {
    data: {
      xdt_api__v1__feed__user_timeline_graphql_connection: {
        edges: [{
          node: {
            pk: "a", code: "a", media_type: 1, taken_at: 1, like_count: 3,
            user: { pk: dono },
            image_versions2: { candidates: [{ url: "https://cdn.test/a.jpg", width: 1080 }] },
          },
        }],
        page_info: { has_next_page: true, end_cursor: "C1" },
      },
    },
  },
});

function executorFalso({ capturas = [[capturaBoa()]] } = {}) {
  let n = 0;
  return {
    acharOuAbrirAba: vi.fn().mockResolvedValue({ abaId: 5, criada: true }),
    fecharSeCriada: vi.fn().mockResolvedValue(undefined),
    rodar: vi.fn(async () => capturas[Math.min(n++, capturas.length - 1)]),
  };
}

const aprender = (executor, extra = {}) =>
  criarAprendiz({ executor, esperar: () => Promise.resolve(), ...extra }).aprender({
    urlDoPerfil: "https://www.instagram.com/fulano/",
    idDoDono: "777",
    adaptador: instagram,
  });

describe("aprender a consulta com uma passada pela aba", () => {
  it("devolve assinatura pronta para paginar e a primeira página junto", async () => {
    const ex = executorFalso();
    const r = await aprender(ex);

    expect(r.assinatura.url).toBe(GRAPHQL);
    expect(r.assinatura.paramCursor).toBe("after");
    expect(r.assinatura.ondeVaiOCursor).toBe("form");
    // A primeira página já vem paga: não custa uma requisição a mais.
    expect(r.pagina.itens.map((i) => i.id)).toEqual(["a"]);
    expect(r.pagina.cursor).toBe("C1");
  });

  it("abre a aba em segundo plano: a tela do usuário não é tomada", async () => {
    const ex = executorFalso();
    await aprender(ex);
    expect(ex.acharOuAbrirAba).toHaveBeenCalledWith(
      "https://www.instagram.com/fulano/",
      { visivel: false },
    );
  });

  it("fecha a aba que abriu, mesmo quando não aprende nada", async () => {
    const ex = executorFalso({ capturas: [[]] });
    await aprender(ex, { tentativas: 2 }).catch(() => {});
    expect(ex.fecharSeCriada).toHaveBeenCalledWith({ abaId: 5, criada: true });
  });

  it("nunca copia o cookie para a assinatura", async () => {
    const ex = executorFalso();
    const r = await aprender(ex);
    expect(Object.keys(r.assinatura.headers)).not.toContain("cookie");
  });

  it("recusa captura de outro perfil, que contaminaria o catálogo", async () => {
    const ex = executorFalso({ capturas: [[capturaBoa("999")], [capturaBoa("777")]] });
    const r = await aprender(ex);
    expect(r.pagina.itens).toHaveLength(1);
    expect(ex.rodar).toHaveBeenCalledTimes(2);
  });

  it("insiste enquanto a página ainda não consultou o feed", async () => {
    const ex = executorFalso({ capturas: [[], [], [capturaBoa()]] });
    const r = await aprender(ex);
    expect(r.assinatura).toBeTruthy();
    expect(ex.rodar).toHaveBeenCalledTimes(3);
  });

  it("desiste com erro dizível em vez de esperar para sempre", async () => {
    const ex = executorFalso({ capturas: [[]] });
    const erro = await aprender(ex, { tentativas: 3 }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDeAssinatura);
    expect(erro.message).toMatch(/não consultou o feed/i);
    expect(ex.rodar).toHaveBeenCalledTimes(3);
  });

  it("ignora captura sem json, que não serve para nada", async () => {
    const ex = executorFalso({
      capturas: [[{ ...capturaBoa(), json: null }], [capturaBoa()]],
    });
    const r = await aprender(ex);
    expect(r.pagina.itens).toHaveLength(1);
  });
});
