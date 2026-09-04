import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { abrirAcervo, NOME_BANCO, VERSAO } from "../src/core/db.js";
import { criarPosts, criarPost } from "./apoio/fabrica.js";

let repo;

beforeEach(async () => {
  // Banco novo a cada teste, para nenhum sujar o outro.
  globalThis.indexedDB = new IDBFactory();
  repo = await abrirAcervo();
});

describe("abrirAcervo", () => {
  it("cria o banco com o nome e a versão da spec", () => {
    expect(repo.db.name).toBe(NOME_BANCO);
    expect(repo.db.version).toBe(VERSAO);
  });

  it("cria os cinco stores", () => {
    expect([...repo.db.objectStoreNames].sort()).toEqual([
      "baixados", "handles", "jobs", "posts", "profiles",
    ]);
  });
});

describe("perfis", () => {
  it("salva e lê de volta", async () => {
    await repo.perfis.salvar({ key: "ig:@a", handle: "a", totalIndexado: 10 });
    expect((await repo.perfis.obter("ig:@a")).handle).toBe("a");
  });

  it("devolve undefined para perfil que não existe", async () => {
    expect(await repo.perfis.obter("ig:@fantasma")).toBeUndefined();
  });

  it("atualiza o cursor de retomada ao salvar de novo", async () => {
    await repo.perfis.salvar({ key: "ig:@a", cursor: "c1", totalIndexado: 10 });
    await repo.perfis.salvar({ key: "ig:@a", cursor: "c2", totalIndexado: 20 });
    const p = await repo.perfis.obter("ig:@a");
    expect(p.cursor).toBe("c2");
    expect(await repo.perfis.listar()).toHaveLength(1);
  });

  it("mescla em vez de substituir: dois escritores diferentes gravam aqui", async () => {
    // O service worker grava a assinatura; o indexador grava o progresso.
    // Com put puro, o segundo apagava o campo do primeiro e o botão de
    // indexar ficava permanentemente desabilitado.
    await repo.perfis.salvar({ key: "ig:@a", assinatura: { url: "https://feed" } });
    await repo.perfis.salvar({ key: "ig:@a", cursor: "c1", totalIndexado: 12 });

    const p = await repo.perfis.obter("ig:@a");
    expect(p.assinatura).toEqual({ url: "https://feed" });
    expect(p.cursor).toBe("c1");
    expect(p.totalIndexado).toBe(12);
  });

  it("uma assinatura nova substitui a anterior, sem virar mistura", async () => {
    await repo.perfis.salvar({ key: "ig:@a", assinatura: { url: "https://velha", doc: 1 } });
    await repo.perfis.salvar({ key: "ig:@a", assinatura: { url: "https://nova" } });
    expect(await repo.perfis.obter("ig:@a")).toMatchObject({
      assinatura: { url: "https://nova" },
    });
    expect((await repo.perfis.obter("ig:@a")).assinatura.doc).toBeUndefined();
  });
});

describe("posts", () => {
  it("salva um lote e conta por perfil", async () => {
    await repo.posts.salvarLote(criarPosts(150));
    expect(await repo.posts.contar("ig:@perfil")).toBe(150);
  });

  it("não duplica ao reindexar o mesmo perfil", async () => {
    const posts = criarPosts(50);
    await repo.posts.salvarLote(posts);
    await repo.posts.salvarLote(posts);
    expect(await repo.posts.contar("ig:@perfil")).toBe(50);
  });

  it("sobrescreve métricas na reindexação", async () => {
    const post = criarPost({ id: "X", curtidas: 10 });
    await repo.posts.salvarLote([post]);
    await repo.posts.salvarLote([{ ...post, curtidas: 999 }]);
    const [lido] = await repo.posts.listarPorPerfil("ig:@perfil");
    expect(lido.curtidas).toBe(999);
  });

  it("lista só os posts do perfil pedido", async () => {
    await repo.posts.salvarLote([
      criarPost({ id: "A", perfil: "um" }),
      criarPost({ id: "B", perfil: "dois" }),
    ]);
    const lista = await repo.posts.listarPorPerfil("ig:@um");
    expect(lista.map((p) => p.id)).toEqual(["A"]);
  });

  it("devolve os posts em ordem de seq", async () => {
    await repo.posts.salvarLote([
      criarPost({ id: "C", seq: 3 }),
      criarPost({ id: "A", seq: 1 }),
      criarPost({ id: "B", seq: 2 }),
    ]);
    const lista = await repo.posts.listarPorPerfil("ig:@perfil");
    expect(lista.map((p) => p.id)).toEqual(["A", "B", "C"]);
  });

  it("informa o maior seq, que é onde a indexação retoma", async () => {
    await repo.posts.salvarLote(criarPosts(37));
    expect(await repo.posts.maiorSeq("ig:@perfil")).toBe(37);
  });

  it("devolve 0 de maior seq quando o perfil está vazio", async () => {
    expect(await repo.posts.maiorSeq("ig:@vazio")).toBe(0);
  });

  it("aguenta um lote grande de uma vez", async () => {
    await repo.posts.salvarLote(criarPosts(3000));
    expect(await repo.posts.contar("ig:@perfil")).toBe(3000);
  });

  it("limpa só o perfil pedido", async () => {
    await repo.posts.salvarLote([
      criarPost({ id: "A", perfil: "um" }),
      criarPost({ id: "B", perfil: "dois" }),
    ]);
    await repo.posts.limpar("ig:@um");
    expect(await repo.posts.contar("ig:@um")).toBe(0);
    expect(await repo.posts.contar("ig:@dois")).toBe(1);
  });

  it("aceita lote vazio sem reclamar", async () => {
    await expect(repo.posts.salvarLote([])).resolves.toBeUndefined();
  });
});

describe("baixados", () => {
  it("marca e lê as chaves do perfil", async () => {
    await repo.baixados.marcar([
      { key: "ig:@a#1", profileKey: "ig:@a", jobId: "j1", arquivos: ["x.mp4"] },
      { key: "ig:@a#2", profileKey: "ig:@a", jobId: "j1", arquivos: ["y.mp4"] },
    ]);
    const chaves = await repo.baixados.chavesDoPerfil("ig:@a");
    expect(chaves).toBeInstanceOf(Set);
    expect([...chaves].sort()).toEqual(["ig:@a#1", "ig:@a#2"]);
  });

  it("marcar duas vezes não cria registro duplicado", async () => {
    const reg = { key: "ig:@a#1", profileKey: "ig:@a", jobId: "j1", arquivos: [] };
    await repo.baixados.marcar([reg]);
    await repo.baixados.marcar([reg]);
    expect((await repo.baixados.chavesDoPerfil("ig:@a")).size).toBe(1);
  });

  it("devolve conjunto vazio para perfil sem histórico", async () => {
    expect((await repo.baixados.chavesDoPerfil("ig:@novo")).size).toBe(0);
  });

  it("carimba a data do download", async () => {
    await repo.baixados.marcar([{ key: "ig:@a#1", profileKey: "ig:@a", jobId: "j" }]);
    const [reg] = await repo.baixados.listarPorPerfil("ig:@a");
    expect(reg.baixadoEm).toBeTypeOf("number");
  });
});

describe("jobs e handles", () => {
  it("salva e lê um job", async () => {
    await repo.jobs.salvar({ jobId: "j1", profileKey: "ig:@a", status: "rodando" });
    expect((await repo.jobs.obter("j1")).status).toBe("rodando");
  });

  it("guarda um valor opaco no store de handles", async () => {
    const falso = { tipo: "handle-de-pasta" };
    await repo.handles.salvar("pastaDestino", falso);
    expect(await repo.handles.obter("pastaDestino")).toEqual(falso);
  });
});
