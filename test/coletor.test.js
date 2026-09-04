import { describe, it, expect, vi } from "vitest";
import { criarColetor } from "../src/acervo/coletor.js";
import { instagram } from "../src/adapters/instagram.js";
import { tiktok } from "../src/adapters/tiktok.js";
import * as sondas from "../src/acervo/sondas.js";

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

/** Executor falso: despacha pelo nome da função-sonda que recebeu. */
function executorFalso(respostas) {
  const chamadas = [];
  return {
    chamadas,
    rodar: vi.fn(async (abaId, func, args = []) => {
      const nome = func.name;
      chamadas.push({ nome, args });
      const r = respostas[nome];
      return typeof r === "function" ? r(args, chamadas) : r;
    }),
    acharOuAbrirAba: vi.fn().mockResolvedValue({ abaId: 9, criada: false }),
    fecharSeCriada: vi.fn().mockResolvedValue(undefined),
    ativar: vi.fn().mockResolvedValue(3),
    restaurar: vi.fn().mockResolvedValue(undefined),
  };
}

const paginaRest = (codes, maxId, mais) => ({
  items: codes.map((code) => ({
    pk: code, code, media_type: 1, like_count: 1, taken_at: 1,
    image_versions2: { candidates: [{ url: `https://cdn.test/${code}.jpg`, width: 10, height: 10 }] },
  })),
  more_available: mais,
  next_max_id: maxId,
});

/** Uma captura de feed do Instagram, como a rolagem faria surgir. */
const capturaIG = (codes, mais) => ({ json: paginaRest(codes, mais ? "M" : null, mais) });

const semEspera = () => Promise.resolve();

describe("Instagram", () => {
  it("identifica o perfil e pagina até o fim", async () => {
    const repo = repoFalso();
    let n = 0;
    const executor = executorFalso({
      capturaInstalada: true,
      drenarCapturas: [],
      lerPerfilDaPagina: { ok: false },
      sondarInstagram: { ok: true, status: 200, userId: "123", handle: "fulano", total: 3 },
      buscarJson: () => {
        n++;
        return n === 1
          ? { ok: true, status: 200, json: paginaRest(["a", "b"], "M1", true) }
          : { ok: true, status: 200, json: paginaRest(["c"], null, false) };
      },
    });

    const coletor = criarColetor({ executor, repo, esperar: semEspera });
    const r = await coletor.coletar({
      adaptador: instagram,
      handle: "fulano",
      profileKey: "ig:@fulano",
      urlDoPerfil: "https://www.instagram.com/fulano/",
    });

    expect(r.indexados).toBe(3);
    expect(r.completo).toBe(true);
    expect(repo.posts.todos().map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(repo.posts.todos().map((p) => p.seq)).toEqual([1, 2, 3]);
  });

  it("põe o max_id na url da segunda página", async () => {
    const repo = repoFalso();
    let n = 0;
    const executor = executorFalso({
      capturaInstalada: true,
      drenarCapturas: [],
      lerPerfilDaPagina: { ok: false },
      sondarInstagram: { ok: true, status: 200, userId: "123", total: 3 },
      buscarJson: () => {
        n++;
        return n === 1
          ? { ok: true, status: 200, json: paginaRest(["a"], "MAXID_1", true) }
          : { ok: true, status: 200, json: paginaRest(["b"], null, false) };
      },
    });

    const coletor = criarColetor({ executor, repo, esperar: semEspera });
    await coletor.coletar({
      adaptador: instagram, handle: "f", profileKey: "ig:@f",
      urlDoPerfil: "https://www.instagram.com/f/",
    });

    const urls = executor.chamadas.filter((c) => c.nome === "buscarJson").map((c) => c.args[0]);
    expect(urls[0]).toContain("/api/v1/feed/user/123/");
    expect(urls[0]).not.toContain("max_id");
    expect(urls[1]).toContain("max_id=MAXID_1");
  });

  it("recua para a rolagem quando o perfil não pôde ser identificado", async () => {
    const repo = repoFalso();
    let vez = 0;
    const executor = executorFalso({
      capturaInstalada: true,
      lerPerfilDaPagina: { ok: false },
      sondarInstagram: { ok: false, status: 404 },
      rolarUmPouco: { alturaDepois: 1 },
      drenarCapturas: () => {
        vez++;
        // A primeira drenagem é a do início da coleta, antes de identificar.
        if (vez === 1) return [];
        if (vez === 2) return [capturaIG(["r1", "r2"], false)];
        return [];
      },
    });
    const coletor = criarColetor({ executor, repo, esperar: semEspera });

    const r = await coletor.coletar({
      adaptador: instagram, handle: "nao_existe", profileKey: "ig:@nao_existe",
      urlDoPerfil: "https://www.instagram.com/nao_existe/",
    });

    expect(r.recuouParaRolagem).toBe(true);
    expect(repo.posts.todos().map((p) => p.id)).toEqual(["r1", "r2"]);
  });

  it("avisa que o perfil é privado em vez de devolver vazio", async () => {
    const repo = repoFalso();
    const executor = executorFalso({
      capturaInstalada: true,
      drenarCapturas: [],
      lerPerfilDaPagina: { ok: false },
      sondarInstagram: { ok: true, status: 200, userId: "1", privado: true, total: 0 },
      buscarJson: { ok: true, status: 200, json: paginaRest([], null, false) },
    });
    const coletor = criarColetor({ executor, repo, esperar: semEspera });

    await expect(
      coletor.coletar({
        adaptador: instagram, handle: "p", profileKey: "ig:@p",
        urlDoPerfil: "https://www.instagram.com/p/",
      }),
    ).rejects.toThrow(/privado/i);
  });

  it("recua para a rolagem quando a API bloqueia no meio", async () => {
    const repo = repoFalso();
    let vez = 0;
    const executor = executorFalso({
      capturaInstalada: true,
      lerPerfilDaPagina: { ok: true, userId: "1" },
      buscarJson: { ok: false, status: 429, json: null },
      rolarUmPouco: { alturaDepois: 1 },
      drenarCapturas: () => {
        vez++;
        if (vez === 1) return [];
        if (vez === 2) return [capturaIG(["r1"], false)];
        return [];
      },
    });
    const coletor = criarColetor({ executor, repo, esperar: semEspera });

    const r = await coletor.coletar({
      adaptador: instagram, handle: "f", profileKey: "ig:@f",
      urlDoPerfil: "https://www.instagram.com/f/",
    });

    expect(r.recuouParaRolagem).toBe(true);
    expect(repo.posts.todos().map((p) => p.id)).toEqual(["r1"]);
  });

  it("grava o progresso a cada página, para retomar depois", async () => {
    const repo = repoFalso();
    let n = 0;
    const executor = executorFalso({
      capturaInstalada: true,
      drenarCapturas: [],
      lerPerfilDaPagina: { ok: false },
      sondarInstagram: { ok: true, status: 200, userId: "1", total: 2 },
      buscarJson: () => {
        n++;
        return n === 1
          ? { ok: true, status: 200, json: paginaRest(["a"], "M1", true) }
          : { ok: true, status: 200, json: paginaRest(["b"], null, false) };
      },
    });
    const coletor = criarColetor({ executor, repo, esperar: semEspera });
    await coletor.coletar({
      adaptador: instagram, handle: "f", profileKey: "ig:@f",
      urlDoPerfil: "https://www.instagram.com/f/",
    });

    const perfil = await repo.perfis.obter("ig:@f");
    expect(perfil.completo).toBe(true);
    expect(perfil.totalIndexado).toBe(2);
    expect(perfil.userId).toBe("1");
  });

  it("respeita o teto", async () => {
    const repo = repoFalso();
    let n = 0;
    const executor = executorFalso({
      capturaInstalada: true,
      drenarCapturas: [],
      lerPerfilDaPagina: { ok: false },
      sondarInstagram: { ok: true, status: 200, userId: "1", total: 999 },
      // Cada página traz posts diferentes, como o feed real faz.
      buscarJson: () => {
        const base = n * 3;
        n++;
        return {
          ok: true,
          status: 200,
          json: paginaRest([`p${base}`, `p${base + 1}`, `p${base + 2}`], `M${n}`, true),
        };
      },
    });
    const coletor = criarColetor({ executor, repo, esperar: semEspera });
    const r = await coletor.coletar({
      adaptador: instagram, handle: "f", profileKey: "ig:@f",
      urlDoPerfil: "https://www.instagram.com/f/", teto: 5,
    });
    expect(r.indexados).toBe(6);
    expect(r.completo).toBe(false);
  });

  it("desiste quando o cursor trava e a mesma página volta sempre", async () => {
    const repo = repoFalso();
    const executor = executorFalso({
      capturaInstalada: true,
      drenarCapturas: [],
      lerPerfilDaPagina: { ok: false },
      sondarInstagram: { ok: true, status: 200, userId: "1", total: 999 },
      // Cursor travado: o feed real faz isso quando algo dá errado do lado dele.
      buscarJson: { ok: true, status: 200, json: paginaRest(["a", "b"], "SEMPRE", true) },
    });
    const coletor = criarColetor({ executor, repo, esperar: semEspera });
    const r = await coletor.coletar({
      adaptador: instagram, handle: "f", profileKey: "ig:@f",
      urlDoPerfil: "https://www.instagram.com/f/",
    });

    expect(r.indexados).toBe(2);
    expect(repo.posts.todos()).toHaveLength(2);
    // Encerra em poucas páginas em vez de girar para sempre.
    expect(r.paginas).toBeLessThanOrEqual(4);
  });

  it("cancela quando o sinal manda, guardando o que já entrou", async () => {
    const repo = repoFalso();
    const ctrl = new AbortController();
    const executor = executorFalso({
      capturaInstalada: true,
      drenarCapturas: [],
      lerPerfilDaPagina: { ok: false },
      sondarInstagram: { ok: true, status: 200, userId: "1", total: 99 },
      buscarJson: () => {
        ctrl.abort();
        return { ok: true, status: 200, json: paginaRest(["a"], "M", true) };
      },
    });
    const coletor = criarColetor({ executor, repo, esperar: semEspera });
    const r = await coletor.coletar({
      adaptador: instagram, handle: "f", profileKey: "ig:@f",
      urlDoPerfil: "https://www.instagram.com/f/", sinal: ctrl.signal,
    });
    expect(r.completo).toBe(false);
    expect(repo.posts.todos()).toHaveLength(1);
  });
});

describe("identificação do perfil sem gastar requisição", () => {
  it("lê o id da própria página e nem consulta a API", async () => {
    const repo = repoFalso();
    const executor = executorFalso({
      capturaInstalada: true,
      drenarCapturas: [],
      lerPerfilDaPagina: { ok: true, userId: "777", fonte: "pagina" },
      buscarJson: { ok: true, status: 200, json: paginaRest(["a"], null, false) },
    });

    const coletor = criarColetor({ executor, repo, esperar: semEspera });
    await coletor.coletar({
      adaptador: instagram, handle: "f", profileKey: "ig:@f",
      urlDoPerfil: "https://www.instagram.com/f/",
    });

    expect(executor.chamadas.some((c) => c.nome === "sondarInstagram")).toBe(false);
    const url = executor.chamadas.find((c) => c.nome === "buscarJson").args[0];
    expect(url).toContain("/api/v1/feed/user/777/");
  });

  it("cai na API quando a página não traz o id", async () => {
    const repo = repoFalso();
    const executor = executorFalso({
      capturaInstalada: true,
      drenarCapturas: [],
      lerPerfilDaPagina: { ok: false },
      sondarInstagram: { ok: true, status: 200, userId: "888" },
      buscarJson: { ok: true, status: 200, json: paginaRest(["a"], null, false) },
    });

    const coletor = criarColetor({ executor, repo, esperar: semEspera });
    await coletor.coletar({
      adaptador: instagram, handle: "f", profileKey: "ig:@f",
      urlDoPerfil: "https://www.instagram.com/f/",
    });

    expect(executor.chamadas.some((c) => c.nome === "sondarInstagram")).toBe(true);
  });

  it("avisa sobre o 429 e recua, em vez de abortar", async () => {
    const repo = repoFalso();
    const avisos = [];
    const executor = executorFalso({
      capturaInstalada: true,
      drenarCapturas: [],
      lerPerfilDaPagina: { ok: false },
      sondarInstagram: { ok: false, status: 429 },
      rolarUmPouco: { alturaDepois: 1 },
    });

    const coletor = criarColetor({
      executor, repo, esperar: semEspera,
      aoProgresso: (e) => { if (e.aviso) avisos.push(e.aviso); },
    });
    const r = await coletor.coletar({
      adaptador: instagram, handle: "f", profileKey: "ig:@f",
      urlDoPerfil: "https://www.instagram.com/f/",
    });

    expect(r.recuouParaRolagem).toBe(true);
    expect(avisos.join(" ")).toMatch(/limitando as consultas.*429/is);
    expect(avisos.join(" ")).toMatch(/rolagem/i);
  });

  it("aproveita o que a página já tinha carregado, de graça", async () => {
    const repo = repoFalso();
    const executor = executorFalso({
      capturaInstalada: true,
      // O app já buscou o primeiro feed sozinho quando a página abriu.
      drenarCapturas: [{ json: paginaRest(["ja1", "ja2"], null, false) }],
      lerPerfilDaPagina: { ok: true, userId: "777" },
      buscarJson: { ok: true, status: 200, json: paginaRest(["novo"], null, false) },
    });

    const coletor = criarColetor({ executor, repo, esperar: semEspera });
    const r = await coletor.coletar({
      adaptador: instagram, handle: "f", profileKey: "ig:@f",
      urlDoPerfil: "https://www.instagram.com/f/",
    });

    expect(repo.posts.todos().map((p) => p.id)).toEqual(["ja1", "ja2", "novo"]);
    expect(r.indexados).toBe(3);
  });
});

describe("TikTok", () => {
  const capturaTT = (ids, mais) => ({
    url: "https://www.tiktok.com/api/post/item_list/",
    json: {
      itemList: ids.map((id) => ({
        id, desc: "", createTime: 1, stats: { diggCount: 1, playCount: 1 },
        video: { cover: "https://c/c.jpg", downloadAddr: `https://cdn/${id}.mp4` },
      })),
      hasMore: mais,
      cursor: "c",
    },
  });

  it("rola a página e recolhe o que o app carregou", async () => {
    const repo = repoFalso();
    let vez = 0;
    const executor = executorFalso({
      capturaInstalada: true,
      rolarAteOFim: 1000,
      drenarCapturas: () => {
        vez++;
        if (vez === 1) return [capturaTT(["1", "2"], true)];
        if (vez === 2) return [capturaTT(["3"], false)];
        return [];
      },
    });

    const coletor = criarColetor({ executor, repo, esperar: semEspera });
    const r = await coletor.coletar({
      adaptador: tiktok, handle: "f", profileKey: "tt:@f",
      urlDoPerfil: "https://www.tiktok.com/@f",
    });

    expect(r.indexados).toBe(3);
    expect(repo.posts.todos().map((p) => p.id)).toEqual(["1", "2", "3"]);
  });

  it("não conta o mesmo post duas vezes se a captura repetir", async () => {
    const repo = repoFalso();
    let vez = 0;
    const executor = executorFalso({
      capturaInstalada: true,
      rolarUmPouco: { alturaDepois: 1 },
      drenarCapturas: () => {
        vez++;
        if (vez === 1) return [capturaTT(["1", "2"], true)];
        if (vez === 2) return [capturaTT(["2", "3"], false)];
        return [];
      },
    });
    const coletor = criarColetor({ executor, repo, esperar: semEspera });
    const r = await coletor.coletar({
      adaptador: tiktok, handle: "f", profileKey: "tt:@f",
      urlDoPerfil: "https://www.tiktok.com/@f",
    });

    expect(repo.posts.todos().map((p) => p.id)).toEqual(["1", "2", "3"]);
    expect(r.indexados).toBe(3);
  });

  it("desiste depois de várias rolagens sem nada novo", async () => {
    const repo = repoFalso();
    const executor = executorFalso({
      capturaInstalada: true,
      rolarUmPouco: { alturaDepois: 1 },
      drenarCapturas: [],
    });
    const coletor = criarColetor({
      executor, repo, esperar: semEspera, rolagensSemNovidade: 3,
    });
    const r = await coletor.coletar({
      adaptador: tiktok, handle: "f", profileKey: "tt:@f",
      urlDoPerfil: "https://www.tiktok.com/@f",
    });

    expect(r.indexados).toBe(0);
    expect(executor.chamadas.filter((c) => c.nome === "rolarUmPouco")).toHaveLength(3);
  });
});

describe("contador e rolagem de fechamento", () => {
  it("lê o total declarado e o entrega no resultado", async () => {
    const repo = repoFalso();
    const executor = executorFalso({
      capturaInstalada: true,
      lerTotalDaPagina: { total: 312, fonte: "json" },
      drenarCapturas: [],
      lerPerfilDaPagina: { ok: true, userId: "1" },
      buscarJson: { ok: true, status: 200, json: paginaRest(["a"], null, false) },
      rolarUmPouco: { alturaDepois: 1 },
    });

    const coletor = criarColetor({ executor, repo, esperar: semEspera, rolagensSemNovidade: 1 });
    const r = await coletor.coletar({
      adaptador: instagram, handle: "f", profileKey: "ig:@f",
      urlDoPerfil: "https://www.instagram.com/f/",
    });

    expect(r.total).toBe(312);
  });

  it("informa o total no progresso, para dar denominador ao contador", async () => {
    const repo = repoFalso();
    const vistos = [];
    let vez = 0;
    const executor = executorFalso({
      capturaInstalada: true,
      lerTotalDaPagina: { total: 50, fonte: "json" },
      lerPerfilDaPagina: { ok: false },
      sondarInstagram: { ok: false, status: 404 },
      rolarUmPouco: { alturaDepois: 1 },
      drenarCapturas: () => {
        vez++;
        return vez === 2 ? [capturaIG(["a", "b"], false)] : [];
      },
    });

    const coletor = criarColetor({
      executor, repo, esperar: semEspera, rolagensSemNovidade: 2,
      aoProgresso: (e) => { if (e.rolando) vistos.push(e); },
    });
    await coletor.coletar({
      adaptador: instagram, handle: "f", profileKey: "ig:@f",
      urlDoPerfil: "https://www.instagram.com/f/",
    });

    expect(vistos.length).toBeGreaterThan(0);
    expect(vistos.at(-1).total).toBe(50);
    expect(vistos.at(-1)).toHaveProperty("paradas");
    expect(vistos.at(-1)).toHaveProperty("limite");
  });

  it("rola para fechar quando a API entregou menos que o total declarado", async () => {
    const repo = repoFalso();
    let vez = 0;
    const executor = executorFalso({
      capturaInstalada: true,
      lerTotalDaPagina: { total: 3, fonte: "json" },
      lerPerfilDaPagina: { ok: true, userId: "1" },
      // A API diz que acabou, mas entregou 1 de 3.
      buscarJson: { ok: true, status: 200, json: paginaRest(["api1"], null, false) },
      rolarUmPouco: { alturaDepois: 1 },
      drenarCapturas: () => {
        vez++;
        if (vez === 1) return [];
        if (vez === 2) return [capturaIG(["rol1", "rol2"], false)];
        return [];
      },
    });

    const coletor = criarColetor({ executor, repo, esperar: semEspera, rolagensSemNovidade: 2 });
    const r = await coletor.coletar({
      adaptador: instagram, handle: "f", profileKey: "ig:@f",
      urlDoPerfil: "https://www.instagram.com/f/",
    });

    expect(repo.posts.todos().map((p) => p.id)).toEqual(["api1", "rol1", "rol2"]);
    expect(r.indexados).toBe(3);
  });

  it("não rola de novo quando a API já entregou tudo que o perfil declara", async () => {
    const repo = repoFalso();
    const executor = executorFalso({
      capturaInstalada: true,
      lerTotalDaPagina: { total: 2, fonte: "json" },
      drenarCapturas: [],
      lerPerfilDaPagina: { ok: true, userId: "1" },
      buscarJson: { ok: true, status: 200, json: paginaRest(["a", "b"], null, false) },
      rolarUmPouco: { alturaDepois: 1 },
    });

    const coletor = criarColetor({ executor, repo, esperar: semEspera });
    await coletor.coletar({
      adaptador: instagram, handle: "f", profileKey: "ig:@f",
      urlDoPerfil: "https://www.instagram.com/f/",
    });

    expect(executor.chamadas.some((c) => c.nome === "rolarUmPouco")).toBe(false);
  });

  it("a página crescendo conta como progresso, mesmo sem post novo", async () => {
    const repo = repoFalso();
    let altura = 1000;
    const executor = executorFalso({
      capturaInstalada: true,
      lerTotalDaPagina: { total: null },
      lerPerfilDaPagina: { ok: false },
      sondarInstagram: { ok: false, status: 404 },
      drenarCapturas: [],
      // Sem post novo, mas a página não para de crescer: ainda está carregando.
      rolarUmPouco: () => ({ alturaDepois: (altura += 500) }),
    });

    const coletor = criarColetor({
      executor, repo, esperar: semEspera, rolagensSemNovidade: 3, maxRolagens: 10,
          });
    await coletor.coletar({
      adaptador: instagram, handle: "f", profileKey: "ig:@f",
      urlDoPerfil: "https://www.instagram.com/f/",
    });

    // Enquanto cresce nao desiste, mas o teto absoluto impede girar para sempre.
    const rolagens = executor.chamadas.filter((c) => c.nome === "rolarUmPouco").length;
    expect(rolagens).toBeGreaterThan(3);
    expect(rolagens).toBe(10);
  });
});

describe("via rápida primeiro", () => {
  it("usa a API antes de qualquer rolagem: é ordens de grandeza mais rápida", async () => {
    const repo = repoFalso();
    const executor = executorFalso({
      capturaInstalada: true,
      lerTotalDaPagina: { total: 2, fonte: "json" },
      drenarCapturas: [],
      lerPerfilDaPagina: { ok: true, userId: "1" },
      buscarJson: { ok: true, status: 200, json: paginaRest(["a", "b"], null, false) },
      rolarUmPouco: { alturaDepois: 1 },
    });

    const coletor = criarColetor({ executor, repo, esperar: semEspera });
    await coletor.coletar({
      adaptador: instagram, handle: "f", profileKey: "ig:@f",
      urlDoPerfil: "https://www.instagram.com/f/",
    });

    // A API deu conta do total declarado: rolagem nem entra.
    expect(executor.chamadas.some((c) => c.nome === "rolarUmPouco")).toBe(false);
  });

  it("pede 50 por requisição, não 12", async () => {
    const repo = repoFalso();
    const executor = executorFalso({
      capturaInstalada: true,
      lerTotalDaPagina: { total: 2, fonte: "json" },
      drenarCapturas: [],
      lerPerfilDaPagina: { ok: true, userId: "1" },
      buscarJson: { ok: true, status: 200, json: paginaRest(["a", "b"], null, false) },
      rolarUmPouco: { alturaDepois: 1 },
    });

    const coletor = criarColetor({ executor, repo, esperar: semEspera });
    await coletor.coletar({
      adaptador: instagram, handle: "f", profileKey: "ig:@f",
      urlDoPerfil: "https://www.instagram.com/f/",
    });

    const url = executor.chamadas.find((c) => c.nome === "buscarJson").args[0];
    expect(url).toContain("count=50");
  });

  it("avisa que vai demorar quando precisa recuar para a rolagem", async () => {
    const repo = repoFalso();
    const avisos = [];
    const executor = executorFalso({
      capturaInstalada: true,
      lerTotalDaPagina: { total: 500, fonte: "json" },
      drenarCapturas: [],
      lerPerfilDaPagina: { ok: true, userId: "1" },
      buscarJson: { ok: true, status: 200, json: paginaRest(["a"], null, false) },
      rolarUmPouco: { alturaDepois: 1 },
    });

    const coletor = criarColetor({
      executor, repo, esperar: semEspera, rolagensSemNovidade: 1,
      aoProgresso: (e) => { if (e.aviso) avisos.push(e.aviso); },
    });
    await coletor.coletar({
      adaptador: instagram, handle: "f", profileKey: "ig:@f",
      urlDoPerfil: "https://www.instagram.com/f/",
    });

    expect(avisos.join(" ")).toMatch(/mais lento/i);
    expect(avisos.join(" ")).toMatch(/faltam ~499/);
  });
});

describe("pré-requisitos", () => {
  it("avisa quando o script de captura não está na aba", async () => {
    const repo = repoFalso();
    const executor = executorFalso({ capturaInstalada: false });
    const coletor = criarColetor({ executor, repo, esperar: semEspera });

    await expect(
      coletor.coletar({
        adaptador: tiktok, handle: "f", profileKey: "tt:@f",
        urlDoPerfil: "https://www.tiktok.com/@f",
      }),
    ).rejects.toThrow(/recarregue a aba do perfil/i);
  });

  it("fecha a aba que ele mesmo abriu, mesmo se der erro", async () => {
    const repo = repoFalso();
    const executor = executorFalso({ capturaInstalada: false });
    executor.acharOuAbrirAba.mockResolvedValue({ abaId: 9, criada: true });
    const coletor = criarColetor({ executor, repo, esperar: semEspera });

    await expect(
      coletor.coletar({
        adaptador: tiktok, handle: "f", profileKey: "tt:@f",
        urlDoPerfil: "https://www.tiktok.com/@f",
      }),
    ).rejects.toThrow();
    expect(executor.fecharSeCriada).toHaveBeenCalledWith({ abaId: 9, criada: true });
  });
});

describe("sondas", () => {
  it("são funções sem dependência do módulo, para poderem ser serializadas", () => {
    for (const nome of ["pingar", "capturaInstalada", "buscarJson", "sondarInstagram",
      "rolarAteOFim", "drenarCapturas"]) {
      expect(sondas[nome]).toBeTypeOf("function");
    }
  });
});
