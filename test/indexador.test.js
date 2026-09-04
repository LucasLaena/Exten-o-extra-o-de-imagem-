import { describe, it, expect, vi } from "vitest";
import { criarIndexador } from "../src/acervo/indexador.js";
import { ErroBloqueio } from "../src/core/queue.js";

/** Banco de memória com a mesma superfície que o indexador usa. */
function repoFalso() {
  const posts = new Map();
  const perfis = new Map();
  return {
    posts: {
      async salvarLote(lote) { for (const p of lote) posts.set(p.key, p); },
      async contar() { return posts.size; },
      todos: () => [...posts.values()],
    },
    perfis: {
      async salvar(p) { perfis.set(p.key, { ...perfis.get(p.key), ...p }); },
      async obter(k) { return perfis.get(k); },
      salvos: () => [...perfis.values()],
    },
  };
}

/** Adaptador mínimo: pagina por cursor e devolve o JSON como já parseado. */
function adaptadorFalso() {
  return {
    id: "falso",
    prefixo: "fx",
    proximaPagina: (assinatura, cursor) => ({
      url: `https://falso.test/feed?cursor=${cursor}`,
      init: { method: "GET" },
    }),
    parsear: (json) => json,
  };
}

const pagina = (ids, cursor, temMais) => ({
  itens: ids.map((id) => ({
    id, tipo: "video", curtidas: 0, views: 0, comentarios: 0,
    timestamp: 0, legenda: "", capaUrl: "", fixado: false,
    midias: [{ ordem: 0, kind: "video", url: `https://cdn.test/${id}.mp4` }],
  })),
  cursor,
  temMais,
  totalDeclarado: null,
});

const semEspera = () => Promise.resolve();

describe("indexar", () => {
  it("percorre todas as páginas e grava os posts", async () => {
    const repo = repoFalso();
    const transporte = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: pagina(["a", "b"], "c1", true) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: pagina(["c"], "c2", false) });

    const idx = criarIndexador({
      adaptador: adaptadorFalso(), transporte, repo, esperar: semEspera,
    });
    const r = await idx.indexar({ profileKey: "fx:@p", assinatura: { url: "u" } });

    expect(r.indexados).toBe(3);
    expect(r.completo).toBe(true);
    expect(r.paginas).toBe(2);
    expect(repo.posts.todos().map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("numera seq na ordem de chegada, base 1", async () => {
    const repo = repoFalso();
    const transporte = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: pagina(["a", "b", "c"], null, false),
    });
    const idx = criarIndexador({ adaptador: adaptadorFalso(), transporte, repo, esperar: semEspera });
    await idx.indexar({ profileKey: "fx:@p", assinatura: { url: "u" } });
    expect(repo.posts.todos().map((p) => p.seq)).toEqual([1, 2, 3]);
  });

  it("continua a numeração a partir de seqInicial, para retomar sem bagunçar", async () => {
    const repo = repoFalso();
    const transporte = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: pagina(["d", "e"], null, false),
    });
    const idx = criarIndexador({ adaptador: adaptadorFalso(), transporte, repo, esperar: semEspera });
    await idx.indexar({ profileKey: "fx:@p", assinatura: { url: "u" }, seqInicial: 100 });
    expect(repo.posts.todos().map((p) => p.seq)).toEqual([101, 102]);
  });

  it("monta key e profileKey no formato do banco", async () => {
    const repo = repoFalso();
    const transporte = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: pagina(["abc"], null, false),
    });
    const idx = criarIndexador({ adaptador: adaptadorFalso(), transporte, repo, esperar: semEspera });
    await idx.indexar({ profileKey: "fx:@p", assinatura: { url: "u" } });
    const [post] = repo.posts.todos();
    expect(post.key).toBe("fx:@p#abc");
    expect(post.profileKey).toBe("fx:@p");
  });

  it("aproveita a página que o hook já capturou, sem pedir de novo", async () => {
    const repo = repoFalso();
    const transporte = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: pagina(["b"], null, false),
    });
    const idx = criarIndexador({ adaptador: adaptadorFalso(), transporte, repo, esperar: semEspera });
    const r = await idx.indexar({
      profileKey: "fx:@p",
      assinatura: { url: "u" },
      paginaInicial: pagina(["a"], "c1", true),
    });
    expect(transporte).toHaveBeenCalledTimes(1);
    expect(repo.posts.todos().map((p) => p.id)).toEqual(["a", "b"]);
    expect(r.paginas).toBe(2);
  });

  it("grava o cursor a cada página, para a retomada saber onde parar", async () => {
    const repo = repoFalso();
    const transporte = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: pagina(["a"], "c1", true) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: pagina(["b"], "c2", false) });
    const idx = criarIndexador({ adaptador: adaptadorFalso(), transporte, repo, esperar: semEspera });
    await idx.indexar({ profileKey: "fx:@p", assinatura: { url: "u" } });
    const perfil = await repo.perfis.obter("fx:@p");
    expect(perfil.cursor).toBe("c2");
    expect(perfil.totalIndexado).toBe(2);
    expect(perfil.completo).toBe(true);
  });

  it("retoma do cursor recebido", async () => {
    const repo = repoFalso();
    const transporte = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: pagina(["z"], null, false),
    });
    const idx = criarIndexador({ adaptador: adaptadorFalso(), transporte, repo, esperar: semEspera });
    await idx.indexar({ profileKey: "fx:@p", assinatura: { url: "u" }, cursor: "MEIO" });
    expect(transporte.mock.calls[0][0]).toContain("cursor=MEIO");
  });

  it("para no teto configurado, mesmo com mais páginas disponíveis", async () => {
    const repo = repoFalso();
    const transporte = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: pagina(["a", "b", "c"], "c1", true),
    });
    const idx = criarIndexador({ adaptador: adaptadorFalso(), transporte, repo, esperar: semEspera });
    const r = await idx.indexar({ profileKey: "fx:@p", assinatura: { url: "u" }, teto: 5 });
    expect(r.indexados).toBe(6);
    expect(r.completo).toBe(false);
    expect(transporte).toHaveBeenCalledTimes(2);
  });

  it("para quando a página vem vazia, mesmo se a plataforma disser que há mais", async () => {
    const repo = repoFalso();
    const transporte = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: pagina([], "c1", true),
    });
    const idx = criarIndexador({ adaptador: adaptadorFalso(), transporte, repo, esperar: semEspera });
    const r = await idx.indexar({ profileKey: "fx:@p", assinatura: { url: "u" } });
    expect(transporte).toHaveBeenCalledTimes(1);
    expect(r.indexados).toBe(0);
  });

  it("interrompe na hora em bloqueio, sem retentativa", async () => {
    const repo = repoFalso();
    const transporte = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: pagina(["a"], "c1", true) })
      .mockResolvedValue({ ok: false, status: 429, json: null });
    const idx = criarIndexador({ adaptador: adaptadorFalso(), transporte, repo, esperar: semEspera });

    await expect(
      idx.indexar({ profileKey: "fx:@p", assinatura: { url: "u" } }),
    ).rejects.toBeInstanceOf(ErroBloqueio);

    expect(transporte).toHaveBeenCalledTimes(2);
    // o que já entrou continua salvo
    expect(repo.posts.todos()).toHaveLength(1);
    expect((await repo.perfis.obter("fx:@p")).cursor).toBe("c1");
  });

  it("tenta de novo em falha passageira de rede", async () => {
    const repo = repoFalso();
    const transporte = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: null })
      .mockResolvedValueOnce({ ok: true, status: 200, json: pagina(["a"], null, false) });
    const idx = criarIndexador({
      adaptador: adaptadorFalso(), transporte, repo, esperar: semEspera, baseRetentativa: 1,
    });
    const r = await idx.indexar({ profileKey: "fx:@p", assinatura: { url: "u" } });
    expect(r.indexados).toBe(1);
    expect(transporte).toHaveBeenCalledTimes(2);
  });

  it("espera entre páginas, com jitter na janela da spec", async () => {
    const repo = repoFalso();
    const esperas = [];
    const transporte = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: pagina(["a"], "c1", true) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: pagina(["b"], null, false) });
    const idx = criarIndexador({
      adaptador: adaptadorFalso(), transporte, repo,
      esperar: async (ms) => { esperas.push(ms); },
    });
    await idx.indexar({ profileKey: "fx:@p", assinatura: { url: "u" } });
    expect(esperas.length).toBeGreaterThanOrEqual(1);
    for (const ms of esperas) {
      expect(ms).toBeGreaterThanOrEqual(800);
      expect(ms).toBeLessThanOrEqual(2000);
    }
  });

  it("reporta progresso a cada página", async () => {
    const repo = repoFalso();
    const aoProgresso = vi.fn();
    const transporte = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: pagina(["a", "b"], "c1", true) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: pagina(["c"], null, false) });
    const idx = criarIndexador({
      adaptador: adaptadorFalso(), transporte, repo, aoProgresso, esperar: semEspera,
    });
    await idx.indexar({ profileKey: "fx:@p", assinatura: { url: "u" } });
    expect(aoProgresso).toHaveBeenCalledTimes(2);
    expect(aoProgresso.mock.calls.map((c) => c[0].indexados)).toEqual([2, 3]);
  });

  it("cancela quando o sinal aborta, preservando o que já entrou", async () => {
    const repo = repoFalso();
    const ctrl = new AbortController();
    const transporte = vi.fn().mockImplementation(async () => {
      ctrl.abort();
      return { ok: true, status: 200, json: pagina(["a"], "c1", true) };
    });
    const idx = criarIndexador({ adaptador: adaptadorFalso(), transporte, repo, esperar: semEspera });
    const r = await idx.indexar({
      profileKey: "fx:@p", assinatura: { url: "u" }, sinal: ctrl.signal,
    });
    expect(r.completo).toBe(false);
    expect(repo.posts.todos()).toHaveLength(1);
  });
});
