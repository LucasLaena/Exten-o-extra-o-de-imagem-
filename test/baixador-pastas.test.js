import { describe, it, expect, vi } from "vitest";
import { criarBaixador } from "../src/acervo/baixador.js";
import { instagram } from "../src/adapters/instagram.js";
import { criarPost, criarMidia } from "./apoio/fabrica.js";

function ambiente() {
  const textos = new Map();

  const abrirDestino = vi.fn(async () => new WritableStream({ write() {} }));
  const escreverTexto = vi.fn(async (nome, texto) => { textos.set(nome, texto); });
  const buscarMidia = vi.fn(async () => new Blob(["x"]));
  const repo = {
    baixados: { marcar: vi.fn(async () => {}) },
    jobs: { salvar: vi.fn(async () => {}) },
  };

  return {
    textos,
    baixador: criarBaixador({
      adaptador: instagram, buscarMidia, abrirDestino, escreverTexto, repo,
    }),
  };
}

const pedido = (posts, extra = {}) => ({
  jobId: "j1",
  perfil: "perfil",
  profileKey: "ig:@perfil",
  posts,
  posicoes: new Map(posts.map((p, i) => [p.key, i + 1])),
  opcoes: { filtro: "ambos", incluirCapaReel: false },
  ...extra,
});

/** Todos os caminhos de arquivo que foram parar no CSV. */
const caminhos = (env) => {
  const csv = env.textos.get("acervo.csv") ?? "";
  return csv
    .split("\r\n")
    .slice(1)
    .filter(Boolean)
    .flatMap((linha) => {
      const ultima = linha.split(",").at(-1) ?? "";
      return ultima.replace(/^"|"$/g, "").split(";").filter(Boolean);
    });
};

describe("organização dentro do ZIP", () => {
  it("separa feed, carrossel e capas em pastas próprias", async () => {
    const env = ambiente();
    const posts = [
      criarPost({
        id: "FOTO", seq: 1, tipo: "foto",
        midias: [criarMidia({ ordem: 0, kind: "foto", origem: "publicacao" })],
      }),
      criarPost({
        id: "REEL", seq: 2, tipo: "video", capaUrl: "https://cdn.test/c.jpg",
        midias: [criarMidia({ ordem: 0, kind: "video", origem: "publicacao" })],
      }),
      criarPost({
        id: "CAR", seq: 3, tipo: "carrossel",
        midias: [
          criarMidia({ ordem: 0, kind: "foto", origem: "carrossel" }),
          criarMidia({ ordem: 1, kind: "foto", origem: "carrossel" }),
        ],
      }),
    ];

    await env.baixador.baixar(
      pedido(posts, { opcoes: { filtro: "ambos", incluirCapaReel: true } }),
    );

    const todos = caminhos(env).join(" ");
    expect(todos).toContain("feed/");
    expect(todos).toContain("carrossel/");
    expect(todos).toContain("capas/");
  });

  it("mantém as páginas de um carrossel juntas na mesma pasta", async () => {
    const env = ambiente();
    const album = criarPost({
      id: "ALBUM", seq: 1, tipo: "carrossel",
      midias: [
        criarMidia({ ordem: 0, kind: "foto", origem: "carrossel" }),
        criarMidia({ ordem: 1, kind: "foto", origem: "carrossel" }),
        criarMidia({ ordem: 2, kind: "foto", origem: "carrossel" }),
      ],
    });

    await env.baixador.baixar(pedido([album]));

    const arquivos = caminhos(env);
    expect(arquivos).toHaveLength(3);

    const pastas = new Set(arquivos.map((a) => a.slice(0, a.lastIndexOf("/"))));
    expect(pastas.size).toBe(1);
    expect([...pastas][0]).toBe("carrossel/001_ALBUM");
  });

  it("a capa nunca cai junto com as fotos do feed", async () => {
    const env = ambiente();
    const reel = criarPost({
      id: "R", seq: 1, tipo: "video", capaUrl: "https://cdn.test/c.jpg",
      midias: [criarMidia({ ordem: 0, kind: "video", origem: "publicacao" })],
    });

    await env.baixador.baixar(
      pedido([reel], { opcoes: { filtro: "ambos", incluirCapaReel: true } }),
    );

    const capa = caminhos(env).find((c) => c.includes("_capa."));
    expect(capa).toBeTruthy();
    expect(capa.startsWith("capas/")).toBe(true);
  });

  it("nome igual em pastas diferentes não é renumerado à toa", async () => {
    const env = ambiente();
    const posts = [
      criarPost({
        id: "A", seq: 1, tipo: "foto",
        midias: [criarMidia({ ordem: 0, kind: "foto", origem: "publicacao" })],
      }),
      criarPost({
        id: "B", seq: 2, tipo: "carrossel",
        midias: [criarMidia({ ordem: 0, kind: "foto", origem: "carrossel" })],
      }),
    ];

    await env.baixador.baixar(pedido(posts, { template: "igual" }));

    // Pastas diferentes: nenhum precisa virar "igual-2".
    expect(caminhos(env).join(" ")).not.toContain("igual-2");
  });

  it("nome igual na mesma pasta continua sendo numerado", async () => {
    const env = ambiente();
    const posts = [
      criarPost({
        id: "A", seq: 1, tipo: "foto",
        midias: [criarMidia({ ordem: 0, kind: "foto", origem: "publicacao" })],
      }),
      criarPost({
        id: "B", seq: 2, tipo: "foto",
        midias: [criarMidia({ ordem: 0, kind: "foto", origem: "publicacao" })],
      }),
    ];

    await env.baixador.baixar(pedido(posts, { template: "igual" }));

    expect(caminhos(env).join(" ")).toContain("igual-2");
  });
});
