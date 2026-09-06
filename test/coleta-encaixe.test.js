import { describe, it, expect, vi } from "vitest";
import { abrirCanal } from "../src/acervo/canal.js";
import { criarAprendiz } from "../src/acervo/assinatura-aba.js";
import { criarColetorDireto } from "../src/acervo/direto.js";
import { buscarJson, drenarCapturas } from "../src/acervo/sondas.js";
import { instagram } from "../src/adapters/instagram.js";

//
// As pecas passam nos testes de unidade e quebram no encaixe: foi assim com o
// corpo dentro do Request, com o XHR sem corpo e com o reuso de aba. Aqui a
// corrente inteira roda montada — canal, aprendiz e paginacao — contra um
// Instagram de mentira que responde no formato real.
//

const DOC_ID = "9876543210";
const DONO = "223666448";

const no = (code) => ({
  pk: code,
  code,
  media_type: 1,
  taken_at: 1700000000,
  like_count: 10,
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

/** A captura como o hook a entrega: corpo de verdade, com doc_id. */
const captura = () => ({
  url: "https://www.instagram.com/graphql/query",
  metodo: "POST",
  headers: {
    "content-type": "application/x-www-form-urlencoded",
    "x-ig-app-id": "936619743392459",
    "x-csrftoken": "T0K3N",
    cookie: "sessionid=segredo",
  },
  corpo: `doc_id=${DOC_ID}&variables=${encodeURIComponent(
    JSON.stringify({ id: DONO, first: 12 }),
  )}`,
  json: paginaGql(["p01", "p02"], "CURSOR-1", true),
  em: Date.now(),
});

function repoFalso() {
  const posts = new Map();
  const perfis = new Map();
  return {
    posts: {
      async salvarLote(lote) { for (const p of lote) posts.set(p.key, p); },
      todos: () => [...posts.values()],
    },
    perfis: {
      async salvar(p) { perfis.set(p.key, { ...perfis.get(p.key), ...p }); },
      async obter(k) { return perfis.get(k); },
    },
  };
}

/**
 * Um Instagram de mentira dentro da aba: devolve a captura uma vez e depois
 * pagina, conferindo que o cursor chegou pelo corpo.
 */
function instagramFalso({ paginas }) {
  const pedidos = [];
  let drenagens = 0;

  const executor = {
    acharOuAbrirAba: vi.fn().mockResolvedValue({ abaId: 42, criada: true }),
    fecharSeCriada: vi.fn().mockResolvedValue(undefined),
    rodar: vi.fn(async (_abaId, func, args) => {
      if (func === drenarCapturas) {
        return drenagens++ === 0 ? [captura()] : [];
      }
      if (func === buscarJson) {
        const [, init] = args;
        pedidos.push(init);
        const corpo = new URLSearchParams(init.body);
        const variaveis = JSON.parse(corpo.get("variables"));
        const proxima = paginas[variaveis.after];
        return { ok: true, status: 200, json: proxima ?? paginaGql([], null, false) };
      }
      return undefined;
    }),
  };

  return { executor, pedidos };
}

describe("a corrente inteira, montada", () => {
  it("aprende a consulta e pagina ate o fim, sem tocar na aba de novo", async () => {
    const repo = repoFalso();
    const { executor, pedidos } = instagramFalso({
      paginas: {
        "CURSOR-1": paginaGql(["p03", "p04"], "CURSOR-2", true),
        "CURSOR-2": paginaGql(["p05"], null, false),
      },
    });

    const canal = await abrirCanal({
      executor,
      urlDoPerfil: "https://www.instagram.com/jorgekotz/",
    });

    const { assinatura, pagina } = await criarAprendiz({
      esperar: () => Promise.resolve(),
    }).aprender({ canal, idDoDono: DONO, adaptador: instagram });

    const r = await criarColetorDireto({
      repo,
      buscar: canal.buscar,
      esperar: () => Promise.resolve(),
    }).coletarComAssinatura({
      adaptador: instagram,
      assinatura,
      paginaInicial: pagina,
      profileKey: "ig:@jorgekotz",
      total: 5,
    });

    await canal.fechar();

    expect(r.completo).toBe(true);
    expect(r.indexados).toBe(5);
    expect(r.semAba).toBe(true);

    // A primeira pagina veio junto com a assinatura: so as outras custam ida.
    expect(pedidos).toHaveLength(2);

    const ids = repo.posts.todos().map((p) => p.id);
    expect(ids).toEqual(["p01", "p02", "p03", "p04", "p05"]);

    // A sequencia tem de ser continua entre as paginas, senao a faixa que o
    // usuario escolhe no modal aponta para a publicacao errada.
    expect(repo.posts.todos().map((p) => p.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it("preserva o doc_id em toda pagina: sem ele o Instagram responde 500", async () => {
    const repo = repoFalso();
    const { executor, pedidos } = instagramFalso({
      paginas: { "CURSOR-1": paginaGql(["p03"], null, false) },
    });

    const canal = await abrirCanal({ executor, urlDoPerfil: "https://x.test/" });
    const { assinatura, pagina } = await criarAprendiz({
      esperar: () => Promise.resolve(),
    }).aprender({ canal, idDoDono: DONO, adaptador: instagram });

    await criarColetorDireto({
      repo, buscar: canal.buscar, esperar: () => Promise.resolve(),
    }).coletarComAssinatura({
      adaptador: instagram, assinatura, paginaInicial: pagina,
      profileKey: "ig:@x",
    });

    for (const init of pedidos) {
      expect(new URLSearchParams(init.body).get("doc_id")).toBe(DOC_ID);
    }
  });

  it("nunca reenvia o cookie: quem anexa a sessao e o navegador", async () => {
    const repo = repoFalso();
    const { executor, pedidos } = instagramFalso({
      paginas: { "CURSOR-1": paginaGql(["p03"], null, false) },
    });

    const canal = await abrirCanal({ executor, urlDoPerfil: "https://x.test/" });
    const { assinatura, pagina } = await criarAprendiz({
      esperar: () => Promise.resolve(),
    }).aprender({ canal, idDoDono: DONO, adaptador: instagram });

    await criarColetorDireto({
      repo, buscar: canal.buscar, esperar: () => Promise.resolve(),
    }).coletarComAssinatura({
      adaptador: instagram, assinatura, paginaInicial: pagina,
      profileKey: "ig:@x",
    });

    for (const init of pedidos) {
      const nomes = Object.keys(init.headers ?? {}).map((n) => n.toLowerCase());
      expect(nomes).not.toContain("cookie");
      expect(nomes).toContain("x-ig-app-id");
    }
  });

  it("a aba abre escondida e nova, e fecha no fim", async () => {
    const { executor } = instagramFalso({ paginas: {} });

    const canal = await abrirCanal({ executor, urlDoPerfil: "https://x.test/" });
    await canal.fechar();

    expect(executor.acharOuAbrirAba).toHaveBeenCalledWith("https://x.test/", {
      visivel: false,
      reusar: false,
    });
    expect(executor.fecharSeCriada).toHaveBeenCalledWith({ abaId: 42, criada: true });
  });
});
