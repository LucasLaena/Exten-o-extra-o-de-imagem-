import { describe, it, expect } from "vitest";
import { extrairTotal, estimarTempo } from "../src/core/total-do-perfil.js";

describe("extrairTotal", () => {
  it("lê a contagem do JSON embutido", () => {
    expect(extrairTotal('x{"edge_owner_to_timeline_media":{"count":2043}}y')).toBe(2043);
  });

  it("aceita media_count, que algumas rotas usam", () => {
    expect(extrairTotal('{"media_count":312}')).toBe(312);
  });

  it("cai no texto visível quando não há JSON", () => {
    expect(extrairTotal("<html></html>", "1.240 publicações")).toBe(1240);
  });

  it("tira o separador de milhar do português", () => {
    expect(extrairTotal("", "12.345 publicações")).toBe(12345);
  });

  it("devolve null quando não dá para saber", () => {
    expect(extrairTotal("<html></html>", "sem número aqui")).toBeNull();
    expect(extrairTotal("")).toBeNull();
  });

  it("prefere o JSON ao texto, que é menos confiável", () => {
    expect(extrairTotal('{"media_count":50}', "9.999 publicações")).toBe(50);
  });
});

describe("estimarTempo", () => {
  it("chama de poucos segundos o que cabe numa requisição", () => {
    expect(estimarTempo(50)).toBe("poucos segundos");
  });

  it("dá segundos para perfis médios", () => {
    expect(estimarTempo(500)).toMatch(/^~\d+ s$/);
  });

  it("dá minutos para perfis grandes", () => {
    expect(estimarTempo(2000)).toMatch(/min$/);
  });

  it("não estima o que não existe", () => {
    expect(estimarTempo(0)).toBeNull();
    expect(estimarTempo(null)).toBeNull();
  });
});
