import { describe, it, expect } from "vitest";
import {
  ORDENACOES,
  temFoto,
  temVideo,
  filtrarPorMidia,
  ordenar,
  resolverSelecao,
} from "../src/core/selection.js";
import { criarPost, criarPosts, criarMidia } from "./apoio/fabrica.js";

const carrosselMisto = () =>
  criarPost({
    id: "MISTO",
    tipo: "carrossel",
    midias: [
      criarMidia({ ordem: 0, kind: "foto" }),
      criarMidia({ ordem: 1, kind: "video" }),
    ],
  });

const carrosselSoFoto = () =>
  criarPost({
    id: "SOFOTO",
    tipo: "carrossel",
    midias: [criarMidia({ ordem: 0, kind: "foto" }), criarMidia({ ordem: 1, kind: "foto" })],
  });

describe("temFoto / temVideo", () => {
  it("reconhece post simples", () => {
    expect(temFoto(criarPost({ tipo: "foto" }))).toBe(true);
    expect(temVideo(criarPost({ tipo: "foto" }))).toBe(false);
    expect(temVideo(criarPost({ tipo: "video" }))).toBe(true);
  });

  it("reconhece as duas coisas num carrossel misto", () => {
    const post = carrosselMisto();
    expect(temFoto(post)).toBe(true);
    expect(temVideo(post)).toBe(true);
  });

  it("não inventa vídeo num carrossel só de fotos", () => {
    expect(temVideo(carrosselSoFoto())).toBe(false);
  });
});

describe("filtrarPorMidia", () => {
  const posts = [
    criarPost({ id: "F", tipo: "foto" }),
    criarPost({ id: "V", tipo: "video" }),
    carrosselMisto(),
    carrosselSoFoto(),
  ];

  it("'ambos' não descarta nada", () => {
    expect(filtrarPorMidia(posts, "ambos")).toHaveLength(4);
  });

  it("'fotos' mantém foto e todo carrossel que tenha foto", () => {
    expect(filtrarPorMidia(posts, "fotos").map((p) => p.id)).toEqual([
      "F", "MISTO", "SOFOTO",
    ]);
  });

  it("'videos' mantém vídeo e carrossel misto, e corta o carrossel só de foto", () => {
    expect(filtrarPorMidia(posts, "videos").map((p) => p.id)).toEqual(["V", "MISTO"]);
  });

  it("não muta o array de entrada", () => {
    const copia = [...posts];
    filtrarPorMidia(posts, "videos");
    expect(posts).toEqual(copia);
  });
});

describe("ordenar", () => {
  const posts = [
    criarPost({ id: "A", seq: 1, curtidas: 10, views: 300, timestamp: 300 }),
    criarPost({ id: "B", seq: 2, curtidas: 30, views: 100, timestamp: 100 }),
    criarPost({ id: "C", seq: 3, curtidas: 20, views: 200, timestamp: 200 }),
  ];

  it("exporta as cinco ordenações da spec", () => {
    expect(ORDENACOES).toEqual(["sequencia", "curtidas", "views", "recentes", "antigos"]);
  });

  it("sequência do perfil é seq crescente", () => {
    expect(ordenar(posts, "sequencia").map((p) => p.id)).toEqual(["A", "B", "C"]);
  });

  it("curtidas é decrescente", () => {
    expect(ordenar(posts, "curtidas").map((p) => p.id)).toEqual(["B", "C", "A"]);
  });

  it("views é decrescente", () => {
    expect(ordenar(posts, "views").map((p) => p.id)).toEqual(["A", "C", "B"]);
  });

  it("recentes é data decrescente e antigos é crescente", () => {
    expect(ordenar(posts, "recentes").map((p) => p.id)).toEqual(["A", "C", "B"]);
    expect(ordenar(posts, "antigos").map((p) => p.id)).toEqual(["B", "C", "A"]);
  });

  it("desempata por seq para a ordem ser sempre a mesma", () => {
    const empatados = [
      criarPost({ id: "X", seq: 9, curtidas: 5 }),
      criarPost({ id: "Y", seq: 2, curtidas: 5 }),
      criarPost({ id: "Z", seq: 5, curtidas: 5 }),
    ];
    expect(ordenar(empatados, "curtidas").map((p) => p.id)).toEqual(["Y", "Z", "X"]);
  });

  it("não muta o array de entrada", () => {
    const copia = [...posts];
    ordenar(posts, "curtidas");
    expect(posts).toEqual(copia);
  });

  it("rejeita ordenação desconhecida em vez de devolver lixo", () => {
    expect(() => ordenar(posts, "aleatorio")).toThrow(/ordenação desconhecida/i);
  });
});

describe("resolverSelecao", () => {
  const base = {
    posts: criarPosts(1000, (i) => ({ id: `P${i + 1}`, curtidas: 1000 - i })),
    filtro: "ambos",
    ordenacao: "sequencia",
    modo: "faixa",
    de: 1,
    ate: 1000,
    manuais: new Set(),
    pularBaixados: false,
    baixados: new Set(),
  };

  it("faixa é posicional e inclusiva nas duas pontas", () => {
    const r = resolverSelecao({ ...base, de: 500, ate: 1000 });
    expect(r.selecionados).toHaveLength(501);
    expect(r.selecionados[0].id).toBe("P500");
    expect(r.selecionados.at(-1).id).toBe("P1000");
  });

  it("a posição segue a ordenação escolhida, não o seq do perfil", () => {
    const posts = [
      criarPost({ id: "pouco", seq: 1, views: 10 }),
      criarPost({ id: "muito", seq: 2, views: 999 }),
    ];
    const r = resolverSelecao({ ...base, posts, ordenacao: "views", de: 1, ate: 1 });
    expect(r.selecionados[0].id).toBe("muito");
    expect(r.posicoes.get(r.selecionados[0].key)).toBe(1);
  });

  it("'1 a 100' por curtidas é o top 100 do perfil", () => {
    const r = resolverSelecao({ ...base, ordenacao: "curtidas", de: 1, ate: 100 });
    expect(r.selecionados).toHaveLength(100);
    expect(r.selecionados[0].curtidas).toBe(1000);
    expect(r.selecionados.at(-1).curtidas).toBe(901);
  });

  it("apara a faixa que passa do fim em vez de estourar", () => {
    const r = resolverSelecao({ ...base, de: 990, ate: 99999 });
    expect(r.selecionados).toHaveLength(11);
  });

  it("aceita faixa invertida corrigindo a ordem", () => {
    const r = resolverSelecao({ ...base, de: 10, ate: 5 });
    expect(r.selecionados.map((p) => p.id)).toEqual(["P5", "P6", "P7", "P8", "P9", "P10"]);
  });

  it("devolve vazio quando a faixa começa depois do fim", () => {
    const r = resolverSelecao({ ...base, de: 5000, ate: 6000 });
    expect(r.selecionados).toHaveLength(0);
  });

  it("'tudo' ignora a faixa", () => {
    const r = resolverSelecao({ ...base, modo: "tudo", de: 1, ate: 2 });
    expect(r.selecionados).toHaveLength(1000);
  });

  it("'manual' usa só as chaves marcadas, na ordem da ordenação", () => {
    const manuais = new Set([base.posts[9].key, base.posts[2].key]);
    const r = resolverSelecao({ ...base, modo: "manual", manuais });
    expect(r.selecionados.map((p) => p.id)).toEqual(["P3", "P10"]);
  });

  it("faixa mais manual é união, sem duplicar quem já estava na faixa", () => {
    const manuais = new Set([base.posts[299].key, base.posts[899].key]);
    const r = resolverSelecao({ ...base, de: 1, ate: 500, manuais });
    expect(r.selecionados).toHaveLength(501);
    expect(r.selecionados.map((p) => p.id)).toContain("P900");
  });

  it("pula os já baixados sem renumerar as posições dos outros", () => {
    const baixados = new Set([base.posts[0].key, base.posts[1].key]);
    const r = resolverSelecao({ ...base, de: 1, ate: 5, pularBaixados: true, baixados });
    expect(r.selecionados.map((p) => p.id)).toEqual(["P3", "P4", "P5"]);
    expect(r.posicoes.get(r.selecionados[0].key)).toBe(3);
    expect(r.pulados).toBe(2);
  });

  it("mantém os já baixados quando a opção está desligada", () => {
    const baixados = new Set([base.posts[0].key]);
    const r = resolverSelecao({ ...base, de: 1, ate: 5, pularBaixados: false, baixados });
    expect(r.selecionados).toHaveLength(5);
    expect(r.pulados).toBe(0);
  });

  it("total reflete a lista filtrada inteira, não o recorte", () => {
    const r = resolverSelecao({ ...base, de: 1, ate: 10 });
    expect(r.total).toBe(1000);
    expect(r.selecionados).toHaveLength(10);
  });

  it("o filtro de mídia renumera as posições", () => {
    const posts = [
      criarPost({ id: "v1", seq: 1, tipo: "video" }),
      criarPost({ id: "f1", seq: 2, tipo: "foto" }),
      criarPost({ id: "v2", seq: 3, tipo: "video" }),
    ];
    const r = resolverSelecao({ ...base, posts, filtro: "videos", de: 2, ate: 2 });
    expect(r.selecionados.map((p) => p.id)).toEqual(["v2"]);
    expect(r.posicoes.get(r.selecionados[0].key)).toBe(2);
  });
});
