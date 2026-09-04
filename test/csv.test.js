import { describe, it, expect } from "vitest";
import { escaparCampo, paraCsv, csvDoAcervo, relatorioJson } from "../src/core/csv.js";
import { criarPost } from "./apoio/fabrica.js";

describe("escaparCampo", () => {
  it("deixa texto simples em paz", () => {
    expect(escaparCampo("abc")).toBe("abc");
  });

  it("envolve em aspas quando tem vírgula, aspas ou quebra de linha", () => {
    expect(escaparCampo("a,b")).toBe('"a,b"');
    expect(escaparCampo('diz "oi"')).toBe('"diz ""oi"""');
    expect(escaparCampo("linha1\nlinha2")).toBe('"linha1\nlinha2"');
  });

  it("converte número e nulo sem explodir", () => {
    expect(escaparCampo(42)).toBe("42");
    expect(escaparCampo(null)).toBe("");
    expect(escaparCampo(undefined)).toBe("");
  });
});

describe("paraCsv", () => {
  it("escreve cabeçalho e linhas com BOM", () => {
    const csv = paraCsv(["a", "b"], [{ a: 1, b: 2 }, { a: 3, b: 4 }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe("a,b\r\n1,2\r\n3,4\r\n");
  });

  it("usa CRLF, que é o que o Excel espera", () => {
    expect(paraCsv(["a"], [{ a: 1 }]).slice(1)).toContain("\r\n");
  });

  it("escreve só o cabeçalho quando não há linhas", () => {
    expect(paraCsv(["a", "b"], []).slice(1)).toBe("a,b\r\n");
  });
});

describe("csvDoAcervo", () => {
  const registros = [
    {
      post: criarPost({
        id: "C4xY9k", seq: 500, tipo: "video", curtidas: 1234, views: 56789,
        comentarios: 12, timestamp: 1710253800, legenda: "olá, mundo",
      }),
      posicao: 1,
      arquivos: ["0001_2024-03-12_reel_C4xY9k.mp4"],
    },
  ];

  it("tem as colunas que a spec pede", () => {
    const [cabecalho] = csvDoAcervo(registros).slice(1).split("\r\n");
    expect(cabecalho).toBe(
      "posicao,seq,id,tipo,origem,curtidas,views,comentarios,data,legenda,arquivos",
    );
  });

  it("escreve a data legível em vez do epoch cru", () => {
    expect(csvDoAcervo(registros)).toContain("2024-03-12");
  });

  it("escapa a legenda com vírgula", () => {
    expect(csvDoAcervo(registros)).toContain('"olá, mundo"');
  });

  it("junta vários arquivos do mesmo post com ponto e vírgula", () => {
    const csv = csvDoAcervo([{ ...registros[0], arquivos: ["a.jpg", "b.jpg"] }]);
    expect(csv).toContain("a.jpg;b.jpg");
  });

  it("diz de onde veio a mídia, para separar foto real de capa de vídeo", () => {
    const csv = csvDoAcervo([{
      post: criarPost({ id: "X", midias: [{ ordem: 0, kind: "foto", origem: "carrossel", url: "u" }] }),
      posicao: 1,
      arquivos: ["a.jpg"],
    }]);
    expect(csv).toContain("carrossel");
  });
});

describe("relatorioJson", () => {
  const base = {
    perfil: "ig:@fulano",
    ordenacao: "views",
    filtro: "videos",
    partes: [{ n: 1, nome: "parte-01_posts-001-100.zip", posts: 100, bytes: 12345 }],
    falhas: [{ postKey: "ig:@fulano#X", url: "https://cdn.test/x.mp4", motivo: "404" }],
    comMarcaDagua: ["tt:@x#1"],
  };

  it("é JSON válido e indentado", () => {
    const texto = relatorioJson(base);
    expect(() => JSON.parse(texto)).not.toThrow();
    expect(texto).toContain("\n  ");
  });

  it("registra o pedido que originou o lote", () => {
    const r = JSON.parse(relatorioJson(base));
    expect(r.perfil).toBe("ig:@fulano");
    expect(r.ordenacao).toBe("views");
    expect(r.filtro).toBe("videos");
  });

  it("registra as falhas com motivo", () => {
    const r = JSON.parse(relatorioJson(base));
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0].motivo).toBe("404");
  });

  it("registra o que saiu com marca d'água", () => {
    expect(JSON.parse(relatorioJson(base)).comMarcaDagua).toEqual(["tt:@x#1"]);
  });

  it("carimba quando foi gerado", () => {
    expect(JSON.parse(relatorioJson(base)).geradoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("aceita lote sem nenhuma falha", () => {
    const r = JSON.parse(relatorioJson({ ...base, falhas: [], comMarcaDagua: [] }));
    expect(r.falhas).toEqual([]);
    expect(r.totalDeFalhas).toBe(0);
  });
});
