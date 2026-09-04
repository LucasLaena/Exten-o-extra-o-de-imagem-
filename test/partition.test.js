import { describe, it, expect } from "vitest";
import {
  TAMANHO_PADRAO_PARTE,
  particionar,
  nomeDaParte,
} from "../src/core/partition.js";
import { criarPosts, criarPost, criarMidia } from "./apoio/fabrica.js";

const comPosicoes = (posts, inicio = 1) =>
  new Map(posts.map((p, i) => [p.key, inicio + i]));

describe("TAMANHO_PADRAO_PARTE", () => {
  it("é 100, como a spec manda", () => {
    expect(TAMANHO_PADRAO_PARTE).toBe(100);
  });
});

describe("nomeDaParte", () => {
  it("segue o formato da spec", () => {
    expect(nomeDaParte(1, 500, 599, 4)).toBe("parte-01_posts-0500-0599.zip");
  });

  it("preenche o número da parte com dois dígitos", () => {
    expect(nomeDaParte(9, 1, 100, 3)).toBe("parte-09_posts-001-100.zip");
    expect(nomeDaParte(10, 1, 100, 3)).toBe("parte-10_posts-001-100.zip");
  });

  it("cresce além de dois dígitos quando precisa", () => {
    expect(nomeDaParte(123, 1, 100, 3)).toBe("parte-123_posts-001-100.zip");
  });
});

describe("particionar", () => {
  it("quebra um múltiplo exato em partes iguais", () => {
    const posts = criarPosts(500);
    const partes = particionar(posts, comPosicoes(posts));
    expect(partes).toHaveLength(5);
    expect(partes.every((p) => p.posts.length === 100)).toBe(true);
    expect(partes.map((p) => p.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it("deixa o resto na última parte", () => {
    const posts = criarPosts(250);
    const partes = particionar(posts, comPosicoes(posts));
    expect(partes.map((p) => p.posts.length)).toEqual([100, 100, 50]);
  });

  it("faz uma parte só quando o lote é menor que o tamanho", () => {
    const posts = criarPosts(7);
    const partes = particionar(posts, comPosicoes(posts));
    expect(partes).toHaveLength(1);
    expect(partes[0].posts).toHaveLength(7);
  });

  it("devolve lista vazia para seleção vazia", () => {
    expect(particionar([], new Map())).toEqual([]);
  });

  it("nomeia as partes com as posições reais de início e fim", () => {
    const posts = criarPosts(250);
    const partes = particionar(posts, comPosicoes(posts, 500));
    // maior posição é 749, três dígitos bastam para o lote inteiro
    expect(partes.map((p) => p.nome)).toEqual([
      "parte-01_posts-500-599.zip",
      "parte-02_posts-600-699.zip",
      "parte-03_posts-700-749.zip",
    ]);
  });

  it("usa as posições realmente incluídas quando há buracos", () => {
    const posts = criarPosts(3);
    const posicoes = new Map([
      [posts[0].key, 10],
      [posts[1].key, 45],
      [posts[2].key, 91],
    ]);
    const [parte] = particionar(posts, posicoes);
    expect(parte.primeiraPos).toBe(10);
    expect(parte.ultimaPos).toBe(91);
    expect(parte.nome).toBe("parte-01_posts-010-091.zip");
  });

  it("nunca divide um carrossel entre duas partes", () => {
    const posts = [
      ...criarPosts(99),
      criarPost({
        id: "CAR",
        seq: 100,
        tipo: "carrossel",
        midias: Array.from({ length: 10 }, (_, i) =>
          criarMidia({ ordem: i, kind: "foto" }),
        ),
      }),
      ...criarPosts(1, () => ({ id: "DEPOIS", seq: 101 })),
    ];
    const partes = particionar(posts, comPosicoes(posts));
    expect(partes[0].posts).toHaveLength(100);
    expect(partes[0].posts.at(-1).id).toBe("CAR");
    expect(partes[0].posts.at(-1).midias).toHaveLength(10);
    expect(partes[1].posts).toHaveLength(1);
  });

  it("conta post, não arquivo: uma parte pode ter mais de 100 arquivos", () => {
    const posts = criarPosts(100, (i) => ({
      id: `C${i}`,
      tipo: "carrossel",
      midias: [criarMidia({ ordem: 0, kind: "foto" }), criarMidia({ ordem: 1, kind: "foto" })],
    }));
    const [parte] = particionar(posts, comPosicoes(posts));
    expect(parte.posts).toHaveLength(100);
    const arquivos = parte.posts.reduce((n, p) => n + p.midias.length, 0);
    expect(arquivos).toBe(200);
  });

  it("aceita tamanho de partição customizado", () => {
    const posts = criarPosts(10);
    expect(particionar(posts, comPosicoes(posts), 3).map((p) => p.posts.length))
      .toEqual([3, 3, 3, 1]);
  });

  it("rejeita tamanho inválido em vez de gerar partição absurda", () => {
    const posts = criarPosts(3);
    expect(() => particionar(posts, comPosicoes(posts), 0)).toThrow(/tamanho/i);
    expect(() => particionar(posts, comPosicoes(posts), -5)).toThrow(/tamanho/i);
  });

  it("a largura do número acompanha a maior posição do lote inteiro", () => {
    const posts = criarPosts(150);
    const partes = particionar(posts, comPosicoes(posts, 900));
    // maior posição é 1049, então quatro dígitos em todas as partes
    expect(partes[0].nome).toBe("parte-01_posts-0900-0999.zip");
    expect(partes[1].nome).toBe("parte-02_posts-1000-1049.zip");
  });
});
