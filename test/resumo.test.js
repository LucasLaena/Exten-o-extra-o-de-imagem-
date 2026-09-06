import { describe, it, expect } from "vitest";
import { resumirCatalogo, textoDoResumo } from "../src/core/resumo.js";
import { criarPost, criarMidia } from "./apoio/fabrica.js";

const foto = (id) =>
  criarPost({ id, tipo: "foto", midias: [criarMidia({ ordem: 0, kind: "foto" })] });

const video = (id) =>
  criarPost({ id, tipo: "video", midias: [criarMidia({ ordem: 0, kind: "video" })] });

const carrossel = (id, fotos, videos = 0) =>
  criarPost({
    id,
    tipo: "carrossel",
    midias: [
      ...Array.from({ length: fotos }, (_, i) => criarMidia({ ordem: i, kind: "foto" })),
      ...Array.from({ length: videos }, (_, i) =>
        criarMidia({ ordem: fotos + i, kind: "video" }),
      ),
    ],
  });

describe("resumirCatalogo", () => {
  it("conta cada tipo separadamente", () => {
    const r = resumirCatalogo([foto("a"), foto("b"), video("c"), carrossel("d", 3)]);
    expect(r.publicacoes).toBe(4);
    expect(r.fotos).toBe(2);
    expect(r.videos).toBe(1);
    expect(r.carrosseis).toBe(1);
  });

  it("conta o que há dentro dos carrosséis, que é o que explica o total", () => {
    const r = resumirCatalogo([carrossel("a", 3, 2), carrossel("b", 4)]);
    expect(r.carrosseis).toBe(2);
    expect(r.fotosDeCarrossel).toBe(7);
    expect(r.videosDeCarrossel).toBe(2);
  });

  it("soma os arquivos, que não são o mesmo que publicações", () => {
    // Foi a confusão dos 246 arquivos para 100 publicações.
    const r = resumirCatalogo([foto("a"), carrossel("b", 10)]);
    expect(r.publicacoes).toBe(2);
    expect(r.arquivos).toBe(11);
  });

  it("aceita catálogo vazio", () => {
    const r = resumirCatalogo([]);
    expect(r.publicacoes).toBe(0);
    expect(r.arquivos).toBe(0);
  });

  it("não quebra com post sem mídia", () => {
    const r = resumirCatalogo([criarPost({ id: "x", tipo: "foto", midias: [] })]);
    expect(r.publicacoes).toBe(1);
    expect(r.arquivos).toBe(0);
  });
});

describe("textoDoResumo", () => {
  it("diz tudo que existe, numa linha", () => {
    const texto = textoDoResumo(resumirCatalogo([foto("a"), video("b"), carrossel("c", 3, 1)]));
    expect(texto).toContain("3 publicações");
    expect(texto).toContain("1 foto");
    expect(texto).toContain("1 vídeo");
    expect(texto).toContain("1 carrossel");
    expect(texto).toContain("3 fotos e 1 vídeo");
    // 1 foto + 1 vídeo + as 4 páginas do carrossel.
    expect(texto).toContain("6 arquivos");
  });

  it("omite o que não existe, para cada linha significar algo", () => {
    const texto = textoDoResumo(resumirCatalogo([foto("a"), foto("b")]));
    expect(texto).not.toMatch(/carrossel/i);
    expect(texto).not.toMatch(/vídeo/i);
  });

  it("usa singular quando é um só", () => {
    const texto = textoDoResumo(resumirCatalogo([foto("a")]));
    expect(texto).toContain("1 publicação");
    expect(texto).not.toContain("1 publicações");
  });

  it("usa separador de milhar brasileiro", () => {
    const muitos = Array.from({ length: 1500 }, (_, i) => foto(`f${i}`));
    expect(textoDoResumo(resumirCatalogo(muitos))).toContain("1.500");
  });

  it("fica calado com catálogo vazio", () => {
    expect(textoDoResumo(resumirCatalogo([]))).toBe("");
    expect(textoDoResumo(null)).toBe("");
  });
});
