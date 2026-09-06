import { describe, it, expect, vi } from "vitest";
import { criarColetorDireto, ErroDireto } from "../src/acervo/direto.js";
import { instagram } from "../src/adapters/instagram.js";

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

const htmlDoPerfil = (id = "777", total = 300) =>
  `<html><body>${"x".repeat(600)}` +
  `{"id":"${id}","username":"fulano"}` +
  `{"edge_owner_to_timeline_media":{"count":${total}}}` +
  `</body></html>`;

const pagina = (codes, maxId, mais) => ({
  items: codes.map((code) => ({
    pk: code, code, media_type: 1, like_count: 1, taken_at: 1,
    user: { pk: "777" },
    image_versions2: { candidates: [{ url: `https://cdn.test/${code}.jpg`, width: 1080 }] },
  })),
  more_available: mais,
  next_max_id: maxId,
});

/** fetch falso que responde por URL. */
function buscarFalso(respostas) {
  const chamadas = [];
  return {
    chamadas,
    fn: vi.fn(async (url, init) => {
      chamadas.push({ url, init });
      const resposta =
        typeof respostas === "function" ? respostas(url, chamadas) : respostas[url];
      const { status = 200, corpo = "" } = resposta ?? {};
      return {
        status,
        ok: status >= 200 && status < 300,
        text: async () => (typeof corpo === "string" ? corpo : JSON.stringify(corpo)),
      };
    }),
  };
}

const semEspera = () => Promise.resolve();

// Sem chrome no teste, o carimbo de versão vira "?". As asserções olham o
// miolo da mensagem, não o prefixo.

const coletar = (buscar, repo, extra = {}) =>
  criarColetorDireto({ buscar, repo, esperar: semEspera, ...extra }).coletar({
    adaptador: instagram,
    handle: "fulano",
    profileKey: "ig:@fulano",
    ...extra.pedido,
  });

describe("coleta sem abrir aba", () => {
  it("identifica o perfil pela página e pagina o feed", async () => {
    const repo = repoFalso();
    let n = 0;
    const buscar = buscarFalso((url) => {
      if (url.includes("/api/v1/feed/")) {
        n++;
        return {
          corpo: n === 1 ? pagina(["a", "b"], "M1", true) : pagina(["c"], null, false),
        };
      }
      return { corpo: htmlDoPerfil() };
    });

    const r = await coletar(buscar.fn, repo);

    expect(r.indexados).toBe(3);
    expect(r.completo).toBe(true);
    expect(r.semAba).toBe(true);
    expect(repo.posts.todos().map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("nunca abre aba nenhuma: só requisições", async () => {
    const repo = repoFalso();
    const buscar = buscarFalso((url) =>
      url.includes("/api/v1/feed/")
        ? { corpo: pagina(["a"], null, false) }
        : { corpo: htmlDoPerfil() },
    );

    await coletar(buscar.fn, repo);

    // A primeira chamada é a página do perfil; as seguintes, o feed.
    expect(buscar.chamadas[0].url).toBe("https://www.instagram.com/fulano/");
    expect(buscar.chamadas.every((c) => c.init.credentials === "include")).toBe(true);
  });

  it("pede 50 por página, e leva o max_id na seguinte", async () => {
    const repo = repoFalso();
    let n = 0;
    const buscar = buscarFalso((url) => {
      if (!url.includes("/api/v1/feed/")) return { corpo: htmlDoPerfil() };
      n++;
      return { corpo: n === 1 ? pagina(["a"], "MAX1", true) : pagina(["b"], null, false) };
    });

    await coletar(buscar.fn, repo);

    const feeds = buscar.chamadas.filter((c) => c.url.includes("/api/v1/feed/"));
    expect(feeds[0].url).toContain("count=50");
    expect(feeds[0].url).not.toContain("max_id");
    expect(feeds[1].url).toContain("max_id=MAX1");
  });

  it("guarda o total declarado, lido da própria página", async () => {
    const repo = repoFalso();
    const buscar = buscarFalso((url) =>
      url.includes("/api/v1/feed/")
        ? { corpo: pagina(["a"], null, false) }
        : { corpo: htmlDoPerfil("777", 1234) },
    );

    const r = await coletar(buscar.fn, repo);
    expect(r.total).toBe(1234);
  });

  it("respeita o teto, sem varrer o perfil inteiro", async () => {
    const repo = repoFalso();
    let n = 0;
    const buscar = buscarFalso((url) => {
      if (!url.includes("/api/v1/feed/")) return { corpo: htmlDoPerfil() };
      const base = n * 2;
      n++;
      return { corpo: pagina([`p${base}`, `p${base + 1}`], `M${n}`, true) };
    });

    const r = await coletar(buscar.fn, repo, { pedido: { teto: 3 } });
    expect(r.indexados).toBe(4);
    expect(r.completo).toBe(false);
  });
});

describe("quando não dá para seguir sem aba", () => {
  it("perfil privado é recusado, e abrir aba não mudaria nada", async () => {
    const repo = repoFalso();
    const buscar = buscarFalso(() => ({
      corpo: `${"x".repeat(600)}{"is_private": true}`,
    }));

    const erro = await coletar(buscar.fn, repo).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDireto);
    expect(erro.recuperavel).toBe(false);
    expect(erro.message).toMatch(/privado/i);
    expect(erro.message).toMatch(/públicos/i);
  });

  it("perfil inexistente também não é recuperável", async () => {
    const repo = repoFalso();
    const buscar = buscarFalso(() => ({ corpo: "curto" }));

    const erro = await coletar(buscar.fn, repo).catch((e) => e);
    expect(erro.recuperavel).toBe(false);
    expect(erro.message).toMatch(/não achei o perfil/i);
  });

  it("bloqueio é recuperável: vale tentar pelo outro caminho", async () => {
    const repo = repoFalso();
    const buscar = buscarFalso(() => ({ status: 429, corpo: "" }));

    const erro = await coletar(buscar.fn, repo).catch((e) => e);
    expect(erro.recuperavel).toBe(true);
    expect(erro.message).toMatch(/429/);
  });

  it("página sem identificador é recuperável", async () => {
    const repo = repoFalso();
    const buscar = buscarFalso(() => ({ corpo: "y".repeat(900) }));

    const erro = await coletar(buscar.fn, repo).catch((e) => e);
    expect(erro.recuperavel).toBe(true);
    expect(erro.message).toMatch(/identificador/i);
  });

  it("diz a causa crua quando a requisição nem sai", async () => {
    // "status 0" não distingue rede, CORS e cabeçalho recusado. A mensagem do
    // erro é o que permite acertar a causa sem chutar.
    const repo = repoFalso();
    const buscar = vi.fn(async (url) => {
      if (url.includes("/api/v1/feed/")) throw new TypeError("Failed to fetch");
      return {
        ok: true, status: 200,
        text: async () => htmlDoPerfil(),
      };
    });

    const erro = await coletar(buscar, repo).catch((e) => e);
    expect(erro.message).toMatch(/nem saiu/i);
    expect(erro.message).toContain("Failed to fetch");
  });

  it("repassa o corpo da recusa, que costuma dizer o motivo", async () => {
    const repo = repoFalso();
    const buscar = buscarFalso((url) =>
      url.includes("/api/v1/feed/")
        ? { status: 401, corpo: "login_required" }
        : { corpo: htmlDoPerfil() },
    );

    const erro = await coletar(buscar.fn, repo).catch((e) => e);
    expect(erro.message).toContain("401");
    expect(erro.message).toContain("login_required");
  });

  it("reconhece a página HTML no lugar dos dados, que tem causa conhecida", async () => {
    const repo = repoFalso();
    const buscar = buscarFalso((url) =>
      url.includes("/api/v1/feed/")
        ? { corpo: "<!DOCTYPE html><html lang=\"pt-br\"><head></head></html>" }
        : { corpo: htmlDoPerfil() },
    );

    const erro = await coletar(buscar.fn, repo).catch((e) => e);
    expect(erro.message).toMatch(/página do site em vez dos dados/i);
    expect(erro.message).toMatch(/navegação/i);
  });

  it("pede JSON explicitamente no Accept", async () => {
    const repo = repoFalso();
    const buscar = buscarFalso((url) =>
      url.includes("/api/v1/feed/")
        ? { corpo: pagina(["a"], null, false) }
        : { corpo: htmlDoPerfil() },
    );

    await coletar(buscar.fn, repo);
    expect(buscar.chamadas[0].init.headers.accept).toContain("application/json");
  });

  it("insiste antes de desistir de uma página", async () => {
    const repo = repoFalso();
    let feeds = 0;
    const buscar = buscarFalso((url) => {
      if (!url.includes("/api/v1/feed/")) return { corpo: htmlDoPerfil() };
      feeds++;
      return { status: 429, corpo: "" };
    });

    await coletar(buscar.fn, repo).catch(() => {});
    expect(feeds).toBe(3);
  });
});

describe("cancelamento", () => {
  it("para quando o sinal manda, guardando o que já entrou", async () => {
    const repo = repoFalso();
    const ctrl = new AbortController();
    const buscar = buscarFalso((url) => {
      if (!url.includes("/api/v1/feed/")) return { corpo: htmlDoPerfil() };
      ctrl.abort();
      return { corpo: pagina(["a"], "M", true) };
    });

    const r = await coletar(buscar.fn, repo, { pedido: { sinal: ctrl.signal } });
    expect(r.completo).toBe(false);
    expect(repo.posts.todos()).toHaveLength(1);
  });
});

describe("paginar com a consulta aprendida", () => {
  const ASSINATURA = {
    url: "https://www.instagram.com/graphql/query",
    metodo: "POST",
    headers: { "x-ig-app-id": "936619743392459", "content-type": "application/x-www-form-urlencoded" },
    corpo: "doc_id=123&variables=%7B%22id%22%3A%22777%22%7D",
    paramCursor: "after",
    ondeVaiOCursor: "form",
  };

  const paginaGql = (codes, cursor, mais) => ({
    data: {
      xdt_api__v1__feed__user_timeline_graphql_connection: {
        edges: codes.map((code) => ({
          node: {
            pk: code, code, media_type: 1, taken_at: 1, like_count: 1,
            user: { pk: "777" },
            image_versions2: { candidates: [{ url: `https://cdn.test/${code}.jpg`, width: 1080 }] },
          },
        })),
        page_info: { has_next_page: mais, end_cursor: cursor },
      },
    },
  });

  const paginar = (buscar, repo, extra = {}) =>
    criarColetorDireto({ buscar, repo, esperar: semEspera }).coletarComAssinatura({
      adaptador: instagram,
      assinatura: ASSINATURA,
      profileKey: "ig:@fulano",
      ...extra,
    });

  it("aproveita a primeira página já capturada, sem repetir a requisição", async () => {
    const repo = repoFalso();
    const buscar = buscarFalso(() => ({ corpo: paginaGql(["b"], null, false) }));

    const r = await paginar(buscar.fn, repo, {
      paginaInicial: instagram.parsear(paginaGql(["a"], "C1", true)),
    });

    expect(r.indexados).toBe(2);
    expect(repo.posts.todos().map((p) => p.id)).toEqual(["a", "b"]);
    // Uma requisição só: a primeira página veio de graça com a assinatura.
    expect(buscar.chamadas).toHaveLength(1);
  });

  it("leva o cursor no corpo, dentro de variables", async () => {
    const repo = repoFalso();
    const buscar = buscarFalso(() => ({ corpo: paginaGql(["b"], null, false) }));

    await paginar(buscar.fn, repo, {
      paginaInicial: instagram.parsear(paginaGql(["a"], "CURSOR1", true)),
    });

    const corpo = new URLSearchParams(buscar.chamadas[0].init.body);
    expect(JSON.parse(corpo.get("variables")).after).toBe("CURSOR1");
    // O doc_id aprendido tem que sobreviver à troca do cursor.
    expect(corpo.get("doc_id")).toBe("123");
  });

  it("não abre aba: só requisições, com a sessão do navegador", async () => {
    const repo = repoFalso();
    const buscar = buscarFalso(() => ({ corpo: paginaGql(["a"], null, false) }));
    const r = await paginar(buscar.fn, repo);

    expect(r.semAba).toBe(true);
    expect(buscar.chamadas[0].init.credentials).toBe("include");
  });

  it("respeita o teto pedido", async () => {
    const repo = repoFalso();
    let n = 0;
    const buscar = buscarFalso(() => {
      const base = n * 2;
      n++;
      return { corpo: paginaGql([`p${base}`, `p${base + 1}`], `C${n}`, true) };
    });

    const r = await paginar(buscar.fn, repo, { teto: 3 });
    expect(r.indexados).toBe(4);
    expect(r.completo).toBe(false);
  });

  it("para quando o cursor trava, em vez de girar para sempre", async () => {
    const repo = repoFalso();
    const buscar = buscarFalso(() => ({ corpo: paginaGql(["a"], "MESMO", true) }));

    const r = await paginar(buscar.fn, repo);
    expect(r.completo).toBe(true);
    expect(r.indexados).toBe(1);
  });

  it("diz o motivo quando a consulta aprendida deixa de valer", async () => {
    const repo = repoFalso();
    const buscar = buscarFalso(() => ({ status: 400, corpo: "doc_id inválido" }));

    const erro = await paginar(buscar.fn, repo).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDireto);
    expect(erro.message).toContain("400");
    expect(erro.message).toContain("doc_id inválido");
  });

  it("guarda o que entrou antes do cancelamento", async () => {
    const repo = repoFalso();
    const ctrl = new AbortController();
    const buscar = buscarFalso(() => {
      ctrl.abort();
      return { corpo: paginaGql(["a"], "C", true) };
    });

    const r = await paginar(buscar.fn, repo, { sinal: ctrl.signal });
    expect(r.completo).toBe(false);
    expect(repo.posts.todos()).toHaveLength(1);
  });
});
