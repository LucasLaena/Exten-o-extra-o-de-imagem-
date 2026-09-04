import { describe, it, expect } from "vitest";
import {
  TEMPLATE_PADRAO,
  larguraSeq,
  sanitizar,
  extensaoDe,
  montarNome,
  criarResolvedorDeColisao,
} from "../src/core/naming.js";
import { criarPost, criarMidia } from "./apoio/fabrica.js";

describe("larguraSeq", () => {
  it("usa o número de dígitos do maior valor do lote", () => {
    expect(larguraSeq(1000)).toBe(4);
    expect(larguraSeq(9999)).toBe(4);
    expect(larguraSeq(10000)).toBe(5);
  });

  it("nunca desce abaixo de três dígitos", () => {
    expect(larguraSeq(1)).toBe(3);
    expect(larguraSeq(42)).toBe(3);
  });
});

describe("sanitizar", () => {
  it("remove os nove caracteres proibidos no Windows", () => {
    expect(sanitizar('a<b>c:d"e/f\\g|h?i*j')).toBe("abcdefghij");
  });

  it("remove caracteres de controle", () => {
    expect(sanitizar("a\u0000b\u001Fc")).toBe("abc");
  });

  it("colapsa espaços e apara as pontas", () => {
    expect(sanitizar("  muito    espaco  ")).toBe("muito espaco");
  });

  it("remove ponto e espaço no fim, que o Windows descarta em silêncio", () => {
    expect(sanitizar("arquivo...")).toBe("arquivo");
    expect(sanitizar("arquivo   ")).toBe("arquivo");
  });

  it("desarma nomes reservados do Windows", () => {
    expect(sanitizar("CON")).toBe("_CON");
    expect(sanitizar("com1")).toBe("_com1");
    expect(sanitizar("LPT9")).toBe("_LPT9");
    expect(sanitizar("NUL")).toBe("_NUL");
  });

  it("não mexe em nome que só parece reservado", () => {
    expect(sanitizar("CONTRATO")).toBe("CONTRATO");
    expect(sanitizar("COM10")).toBe("COM10");
  });

  it("preserva acento e emoji, que o Windows aceita", () => {
    expect(sanitizar("São Paulo 🎉")).toBe("São Paulo 🎉");
  });

  it("devolve um marcador quando não sobra nada", () => {
    expect(sanitizar("///")).toBe("sem-nome");
    expect(sanitizar("   ")).toBe("sem-nome");
  });
});

describe("extensaoDe", () => {
  it("tira a extensão do caminho da URL", () => {
    expect(extensaoDe("https://cdn.test/a/b/video.mp4", "video")).toBe("mp4");
    expect(extensaoDe("https://cdn.test/foto.jpg", "foto")).toBe("jpg");
  });

  it("ignora a query string, que no CDN é gigante", () => {
    expect(extensaoDe("https://cdn.test/v.mp4?efg=xyz&_nc_ht=a.b", "video")).toBe("mp4");
  });

  it("cai no padrão do tipo quando a URL não tem extensão", () => {
    expect(extensaoDe("https://cdn.test/abc123", "video")).toBe("mp4");
    expect(extensaoDe("https://cdn.test/abc123", "foto")).toBe("jpg");
  });

  it("cai no padrão quando a URL é inválida", () => {
    expect(extensaoDe("não é url", "foto")).toBe("jpg");
  });

  it("rejeita extensão absurda vinda de URL estranha", () => {
    expect(extensaoDe("https://cdn.test/a.umaextensaoenorme", "video")).toBe("mp4");
  });
});

describe("montarNome", () => {
  const base = {
    post: criarPost({
      id: "C4xY9k",
      tipo: "video",
      curtidas: 1234,
      views: 56789,
      timestamp: Math.floor(Date.UTC(2024, 2, 12, 14, 30) / 1000),
    }),
    midia: criarMidia({ kind: "video", url: "https://cdn.test/v.mp4" }),
    posicao: 500,
    perfil: "fulano",
    largura: 4,
  };

  it("monta o nome padrão da spec", () => {
    expect(montarNome(base)).toBe("0500_2024-03-12_reel_C4xY9k.mp4");
  });

  it("chama de foto o que é foto", () => {
    const post = criarPost({ id: "AAA", tipo: "foto" });
    const nome = montarNome({
      ...base,
      post,
      midia: criarMidia({ kind: "foto", url: "https://cdn.test/f.jpg" }),
    });
    expect(nome).toBe("0500_2023-11-14_foto_AAA.jpg");
  });

  it("resolve todos os tokens documentados", () => {
    const nome = montarNome({
      ...base,
      // O separador não pode ser "|": é caractere proibido no Windows e o
      // sanitizar o remove, com razão.
      template: "{seq}.{seqperfil}.{perfil}.{id}.{data}.{hora}.{tipo}.{curtidas}.{views}.{idx}",
    });
    expect(nome).toBe("0500.001.fulano.C4xY9k.2024-03-12.14-30.reel.1234.56789.00.mp4");
  });

  it("trunca a legenda no tamanho pedido", () => {
    const post = criarPost({ id: "B", legenda: "uma legenda bem longa demais" });
    expect(montarNome({ ...base, post, template: "{legenda:10}" })).toBe(
      "uma legend.mp4",
    );
  });

  it("sanitiza a legenda antes de usar no nome", () => {
    const post = criarPost({ id: "B", legenda: "olha: isso/aqui" });
    expect(montarNome({ ...base, post, template: "{legenda:40}" })).toBe(
      "olha issoaqui.mp4",
    );
  });

  it("numera as mídias de um carrossel pela ordem", () => {
    const nomes = [0, 1, 2].map((ordem) =>
      montarNome({
        ...base,
        post: criarPost({ id: "CAR", tipo: "carrossel" }),
        midia: criarMidia({ ordem, kind: "foto", url: "https://cdn.test/f.jpg" }),
        template: "{seq}_{id}_{idx}",
      }),
    );
    expect(nomes).toEqual(["0500_CAR_00.jpg", "0500_CAR_01.jpg", "0500_CAR_02.jpg"]);
  });

  it("marca a capa de Reel com sufixo e a salva como imagem", () => {
    const nome = montarNome({
      ...base,
      ehCapa: true,
      midia: criarMidia({ kind: "foto", url: "https://cdn.test/capa.jpg" }),
    });
    expect(nome).toBe("0500_2024-03-12_reel_C4xY9k_capa.jpg");
  });

  it("deixa token desconhecido em branco em vez de quebrar", () => {
    expect(montarNome({ ...base, template: "a{inexistente}b" })).toBe("ab.mp4");
  });
});

describe("criarResolvedorDeColisao", () => {
  it("deixa o primeiro nome intacto", () => {
    const resolver = criarResolvedorDeColisao();
    expect(resolver("a.mp4")).toBe("a.mp4");
  });

  it("numera as repetições a partir da segunda", () => {
    const resolver = criarResolvedorDeColisao();
    expect(resolver("a.mp4")).toBe("a.mp4");
    expect(resolver("a.mp4")).toBe("a-2.mp4");
    expect(resolver("a.mp4")).toBe("a-3.mp4");
  });

  it("compara sem diferenciar maiúscula, como o Windows faz", () => {
    const resolver = criarResolvedorDeColisao();
    expect(resolver("A.mp4")).toBe("A.mp4");
    expect(resolver("a.mp4")).toBe("a-2.mp4");
  });

  it("não confunde nomes diferentes", () => {
    const resolver = criarResolvedorDeColisao();
    expect(resolver("a.mp4")).toBe("a.mp4");
    expect(resolver("b.mp4")).toBe("b.mp4");
  });

  it("lida com nome sem extensão", () => {
    const resolver = criarResolvedorDeColisao();
    expect(resolver("a")).toBe("a");
    expect(resolver("a")).toBe("a-2");
  });
});

describe("TEMPLATE_PADRAO", () => {
  it("é o template documentado na spec", () => {
    expect(TEMPLATE_PADRAO).toBe("{seq}_{data}_{tipo}_{id}");
  });
});
