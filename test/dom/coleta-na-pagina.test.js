import { describe, it, expect, vi } from "vitest";
import { coletarNaPagina, catalogoNaMemoria } from "../../src/content/coleta.js";
import { instagram } from "../../src/adapters/instagram.js";

const DONO = "223666448";
const DOC_ID = "39535953862670189";

const no = (code) => ({
  pk: code,
  code,
  media_type: 1,
  taken_at: 1700000000,
  like_count: 7,
  user: { pk: DONO },
  image_versions2: { candidates: [{ url: `https://cdn.test/${code}.jpg`, width: 1080 }] },
});

const paginaGql = (codes, cursor, mais) => ({
  data: {
    xdt_api__v1__feed__user_timeline_graphql_connection: {
      edges: codes.map((c) => ({ node: no(c) })),
      page_info: { has_next_page: mais, end_cursor: cursor },
    },
  },
});

const captura = () => ({
  url: "https://www.instagram.com/graphql/query",
  metodo: "POST",
  headers: { "x-ig-app-id": "936619743392459" },
  corpo:
    `doc_id=${DOC_ID}&variables=` +
    encodeURIComponent(JSON.stringify({ username: "jorgekotz", first: 12 })),
  json: paginaGql(["p01", "p02"], "CURSOR-1", true),
});

/**
 * A pagina, de mentira: entrega a captura na primeira drenagem e depois
 * responde as paginas seguintes.
 */
function paginaFalsa({ paginas = {}, capturas = null } = {}) {
  const pedidos = [];
  let drenagens = 0;

  return {
    pedidos,
    cutucoes: { total: 0 },
    canal: {
      abaId: "página",
      drenar: vi.fn(async () => {
        const lista = capturas ?? [[captura()], []];
        return lista[Math.min(drenagens++, lista.length - 1)];
      }),
      cutucar: vi.fn(async () => {}),
      buscar: vi.fn(async (url, init) => {
        pedidos.push(init);
        const vars = JSON.parse(new URLSearchParams(init.body).get("variables"));
        const json = paginas[vars.after] ?? paginaGql([], null, false);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(json),
        };
      }),
      fechar: vi.fn(async () => {}),
    },
  };
}

const documentoFalso = (html) => ({
  documentElement: { innerHTML: html },
  body: { innerText: "" },
});

// O identificador sai da propria pagina, como o extrator espera encontra-lo.
const htmlDoPerfil =
  "x".repeat(600) +
  JSON.stringify({ id: DONO, username: "jorgekotz" }) +
  JSON.stringify({ edge_owner_to_timeline_media: { count: 2565 } });

const coletar = (mundo, extra = {}) =>
  coletarNaPagina({
    adaptador: instagram,
    handle: "jorgekotz",
    profileKey: "ig:@jorgekotz",
    canal: mundo.canal,
    documento: documentoFalso(htmlDoPerfil),
    esperar: () => Promise.resolve(),
    api: { runtime: { id: "acervo-de-mentira" } },
    ...extra,
  });

describe("catálogo na memória", () => {
  it("some quando a página sai: era o pedido", async () => {
    const repo = catalogoNaMemoria();
    await repo.posts.salvarLote([{ key: "a" }]);
    expect(repo.posts.todos()).toHaveLength(1);

    // Outro catalogo nasce vazio: nada sobrevive entre um uso e outro.
    expect(catalogoNaMemoria().posts.todos()).toHaveLength(0);
  });
});

describe("coletar sem sair da página", () => {
  it("aprende a consulta e pagina até o fim", async () => {
    const mundo = paginaFalsa({
      paginas: {
        "CURSOR-1": paginaGql(["p03", "p04"], "CURSOR-2", true),
        "CURSOR-2": paginaGql(["p05"], null, false),
      },
    });

    const r = await coletar(mundo);

    expect(r.completo).toBe(true);
    expect(r.posts.map((p) => p.id)).toEqual(["p01", "p02", "p03", "p04", "p05"]);
    expect(r.posts.map((p) => p.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it("lê o identificador e o total da própria página, sem pedir nada", async () => {
    const mundo = paginaFalsa({ paginas: {} });
    const r = await coletar(mundo);

    expect(r.idDoDono).toBe(DONO);
    expect(r.total).toBe(2565);
  });

  it("não abre nem fecha aba nenhuma", async () => {
    // Toda a dor das versoes anteriores vinha de fazer isto de fora.
    const mundo = paginaFalsa({ paginas: {} });
    await coletar(mundo);
    expect(mundo.canal.fechar).not.toHaveBeenCalled();
  });

  it("cutuca quando a página ainda não consultou o feed", async () => {
    // O Instagram so pede a proxima leva quando a grade e alcancada.
    const mundo = paginaFalsa({
      capturas: [[], [], [], [], [], [captura()]],
      paginas: {},
    });

    await coletar(mundo);
    expect(mundo.canal.cutucar).toHaveBeenCalled();
  });

  it("preserva o doc_id em toda página pedida", async () => {
    const mundo = paginaFalsa({
      paginas: { "CURSOR-1": paginaGql(["p03"], null, false) },
    });

    await coletar(mundo);

    expect(mundo.pedidos.length).toBeGreaterThan(0);
    for (const init of mundo.pedidos) {
      expect(new URLSearchParams(init.body).get("doc_id")).toBe(DOC_ID);
    }
  });

  it("respeita a faixa pedida, sem varrer o perfil inteiro", async () => {
    let n = 0;
    const mundo = paginaFalsa({ paginas: {} });
    mundo.canal.buscar = vi.fn(async () => {
      const base = n * 2;
      n++;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify(paginaGql([`q${base}`, `q${base + 1}`], `C${n}`, true)),
      };
    });

    const r = await coletar(mundo, { teto: 3 });
    expect(r.completo).toBe(false);
    expect(r.posts.length).toBeLessThanOrEqual(6);
  });

  it("avisa cada etapa, para a tela poder contar o que está acontecendo", async () => {
    const mundo = paginaFalsa({ paginas: {} });
    const etapas = [];

    await coletar(mundo, { aoProgresso: (p) => etapas.push(p) });

    expect(etapas.some((e) => e.etapa === "lendo")).toBe(true);
    expect(etapas.some((e) => e.etapa === "aprendida")).toBe(true);
  });
});

describe("extensao recarregada com a pagina aberta", () => {
  it("para na hora, com instrucao, em vez de falhar tres passos adiante", async () => {
    // Sem chrome.runtime as requisicoes morrem em "Failed to fetch", que
    // parece problema de rede e manda procurar a causa no lugar errado.
    const mundo = paginaFalsa({ paginas: {} });

    const erro = await coletar(mundo, { api: { runtime: {} } }).catch((e) => e);

    expect(erro.name).toBe("ErroDeExtensaoMorta");
    expect(erro.message).toMatch(/F5|recarregue a página/i);
    expect(mundo.canal.drenar).not.toHaveBeenCalled();
  });
});
