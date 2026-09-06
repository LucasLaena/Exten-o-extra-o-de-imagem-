import { describe, it, expect } from "vitest";
import { estadoDaTela } from "../src/acervo/mensagens.js";

describe("catálogo com publicações", () => {
  const r = estadoDaTela({ total: 3000, baixados: 12, temAssinatura: true, temAba: true });

  it("resume o que existe", () => {
    expect(r.resumo).toBe("3.000 publicações no catálogo · 12 já baixadas");
  });

  it("não mostra tela de vazio", () => {
    expect(r.vazio).toBeNull();
  });

  it("deixa indexar, para continuar de onde parou", () => {
    expect(r.podeIndexar).toBe(true);
  });
});

describe("catálogo vazio, feed já reconhecido", () => {
  const r = estadoDaTela({ total: 0, baixados: 0, temAssinatura: true, temAba: true });

  it("convida a indexar em vez de deixar a tela muda", () => {
    expect(r.vazio.titulo).toBe("Catálogo vazio");
    expect(r.vazio.passos.join(" ")).toContain("Indexar perfil");
  });

  it("libera o botão", () => {
    expect(r.podeIndexar).toBe(true);
  });
});

describe("feed ainda não reconhecido", () => {
  const r = estadoDaTela({ total: 0, baixados: 0, temAssinatura: false, temAba: true });

  it("explica que falta ver o feed carregar, sem jargão", () => {
    expect(r.vazio.titulo).toBe("Ainda não vi o feed deste perfil");
    const texto = r.vazio.passos.join(" ").toLowerCase();
    expect(texto).toContain("recarregue");
    expect(texto).toContain("role");
  });

  it("não deixa indexar: não haveria de onde", () => {
    expect(r.podeIndexar).toBe(false);
  });

  it("diz por que não dá para colar uma URL aqui", () => {
    expect(r.vazio.porque).toContain("sessão");
  });
});

describe("aba do perfil fechada", () => {
  const r = estadoDaTela({ total: 0, baixados: 0, temAssinatura: true, temAba: false });

  it("pede a aba do perfil de volta", () => {
    expect(r.vazio.titulo).toBe("Abra o perfil numa aba");
    expect(r.podeIndexar).toBe(false);
  });
});

describe("formatação", () => {
  it("usa separador de milhar brasileiro", () => {
    const r = estadoDaTela({ total: 1240, baixados: 0, temAssinatura: true, temAba: true });
    expect(r.resumo).toContain("1.240");
  });

  it("aceita zero sem escrever nada estranho", () => {
    const r = estadoDaTela({ total: 0, baixados: 0, temAssinatura: true, temAba: true });
    expect(r.resumo).toBe("0 publicações no catálogo · 0 já baixadas");
  });
});
