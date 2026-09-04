import { describe, it, expect } from "vitest";
import { tetoDaIndexacao, porQueIndexaTudo } from "../src/acervo/escopo.js";

const base = { escopo: "faixa", modo: "faixa", ordenacao: "sequencia", ate: 50 };

describe("tetoDaIndexacao", () => {
  it("para na última posição pedida quando a ordem é a do perfil", () => {
    // 1 a 50 na ordem do perfil são as 50 primeiras: uma requisição basta.
    expect(tetoDaIndexacao(base)).toBe(50);
  });

  it("usa o fim da faixa, não o tamanho dela", () => {
    expect(tetoDaIndexacao({ ...base, de: 400, ate: 500 })).toBe(500);
  });

  it("aceita faixa invertida", () => {
    expect(tetoDaIndexacao({ ...base, de: 500, ate: 100 })).toBe(500);
  });

  it("não tem teto quando o escopo é o perfil inteiro", () => {
    expect(tetoDaIndexacao({ ...base, escopo: "tudo" })).toBeNull();
  });

  it("não tem teto ao ordenar por relevância", () => {
    // Sem ver todas as publicações é impossível saber quais são as mais vistas.
    expect(tetoDaIndexacao({ ...base, ordenacao: "views" })).toBeNull();
    expect(tetoDaIndexacao({ ...base, ordenacao: "curtidas" })).toBeNull();
  });

  it("não tem teto ao ordenar por data", () => {
    // A ordem do perfil não é a ordem cronológica: publicações fixadas sobem.
    expect(tetoDaIndexacao({ ...base, ordenacao: "recentes" })).toBeNull();
    expect(tetoDaIndexacao({ ...base, ordenacao: "antigos" })).toBeNull();
  });

  it("não tem teto na seleção manual nem no modo tudo", () => {
    expect(tetoDaIndexacao({ ...base, modo: "manual" })).toBeNull();
    expect(tetoDaIndexacao({ ...base, modo: "tudo" })).toBeNull();
  });

  it("nunca devolve teto menor que um", () => {
    expect(tetoDaIndexacao({ ...base, ate: 0 })).toBe(1);
    expect(tetoDaIndexacao({ ...base, ate: -5 })).toBe(1);
  });
});

describe("porQueIndexaTudo", () => {
  it("fica calado quando o teto vale", () => {
    expect(porQueIndexaTudo(base)).toBeNull();
  });

  it("explica que relevância precisa de tudo", () => {
    const texto = porQueIndexaTudo({ ...base, ordenacao: "views" });
    expect(texto).toMatch(/mais vist/i);
  });

  it("explica que data precisa de tudo, por causa das fixadas", () => {
    expect(porQueIndexaTudo({ ...base, ordenacao: "recentes" })).toMatch(/fixad/i);
  });

  it("explica a seleção manual", () => {
    expect(porQueIndexaTudo({ ...base, modo: "manual" })).toMatch(/marcar/i);
  });

  it("fica calado quando o usuário pediu o perfil inteiro de propósito", () => {
    expect(porQueIndexaTudo({ ...base, escopo: "tudo" })).toBeNull();
  });
});
