import { describe, it, expect } from "vitest";
import { instagram } from "../../src/adapters/instagram.js";
import { criarPost, criarMidia } from "../apoio/fabrica.js";

const reel = () =>
  criarPost({
    tipo: "video",
    capaUrl: "https://cdn.test/capa.jpg",
    midias: [criarMidia({ ordem: 0, kind: "video" })],
  });

const foto = () =>
  criarPost({ tipo: "foto", midias: [criarMidia({ ordem: 0, kind: "foto" })] });

const carrosselMisto = () =>
  criarPost({
    tipo: "carrossel",
    midias: [
      criarMidia({ ordem: 0, kind: "foto" }),
      criarMidia({ ordem: 1, kind: "video" }),
      criarMidia({ ordem: 2, kind: "foto" }),
    ],
  });

const opcoes = (p = {}) => ({ filtro: "ambos", incluirCapaReel: false, ...p });

describe("midiasParaBaixar", () => {
  it("com 'ambos' pega tudo do carrossel, na ordem", () => {
    const r = instagram.midiasParaBaixar(carrosselMisto(), opcoes());
    expect(r.map((x) => x.midia.ordem)).toEqual([0, 1, 2]);
    expect(r.every((x) => x.ehCapa === false)).toBe(true);
  });

  it("com 'fotos' pega só as fotos de dentro do carrossel misto", () => {
    const r = instagram.midiasParaBaixar(carrosselMisto(), opcoes({ filtro: "fotos" }));
    expect(r.map((x) => x.midia.ordem)).toEqual([0, 2]);
    expect(r.every((x) => x.midia.kind === "foto")).toBe(true);
  });

  it("com 'videos' pega só o vídeo de dentro do carrossel misto", () => {
    const r = instagram.midiasParaBaixar(carrosselMisto(), opcoes({ filtro: "videos" }));
    expect(r.map((x) => x.midia.ordem)).toEqual([1]);
  });

  it("devolve vazio quando nada do post passa no filtro", () => {
    const soFotos = criarPost({
      tipo: "carrossel",
      midias: [criarMidia({ ordem: 0, kind: "foto" }), criarMidia({ ordem: 1, kind: "foto" })],
    });
    expect(instagram.midiasParaBaixar(soFotos, opcoes({ filtro: "videos" }))).toEqual([]);
  });

  it("um post simples se comporta como carrossel de um item", () => {
    expect(instagram.midiasParaBaixar(foto(), opcoes({ filtro: "fotos" }))).toHaveLength(1);
    expect(instagram.midiasParaBaixar(foto(), opcoes({ filtro: "videos" }))).toEqual([]);
  });

  it("acrescenta a capa do Reel quando pedido", () => {
    const r = instagram.midiasParaBaixar(reel(), opcoes({ incluirCapaReel: true }));
    expect(r).toHaveLength(2);
    expect(r[0].ehCapa).toBe(false);
    expect(r[1].ehCapa).toBe(true);
    expect(r[1].midia.kind).toBe("foto");
    expect(r[1].midia.url).toBe("https://cdn.test/capa.jpg");
  });

  it("não acrescenta capa em post que não tem vídeo", () => {
    const r = instagram.midiasParaBaixar(foto(), opcoes({ incluirCapaReel: true }));
    expect(r).toHaveLength(1);
  });

  it("não acrescenta capa quando o filtro é só fotos, para não virar duplicata", () => {
    const r = instagram.midiasParaBaixar(
      reel(),
      opcoes({ filtro: "fotos", incluirCapaReel: true }),
    );
    expect(r).toEqual([]);
  });

  it("não acrescenta capa quando o post não tem capaUrl", () => {
    const semCapa = criarPost({
      tipo: "video",
      capaUrl: "",
      midias: [criarMidia({ ordem: 0, kind: "video" })],
    });
    expect(instagram.midiasParaBaixar(semCapa, opcoes({ incluirCapaReel: true }))).toHaveLength(1);
  });

  it("rejeita filtro desconhecido", () => {
    expect(() => instagram.midiasParaBaixar(foto(), opcoes({ filtro: "xis" }))).toThrow(/filtro/i);
  });
});

describe("proximaPagina", () => {
  it("põe o cursor na query string quando é onde ele vive", () => {
    const { url, init } = instagram.proximaPagina(
      {
        url: "https://i.instagram.com/api/v1/feed/user/9/?count=12",
        metodo: "GET",
        headers: { "x-ig-app-id": "936619743392459" },
        corpo: null,
        paramCursor: "max_id",
        ondeVaiOCursor: "query",
      },
      "MAXID_XYZ",
    );

    expect(new URL(url).searchParams.get("max_id")).toBe("MAXID_XYZ");
    expect(new URL(url).searchParams.get("count")).toBe("12");
    expect(init.method).toBe("GET");
    expect(init.headers["x-ig-app-id"]).toBe("936619743392459");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeUndefined();
  });

  it("injeta o cursor dentro de variables quando o corpo é form do graphql", () => {
    const corpo = new URLSearchParams({
      doc_id: "123456",
      variables: JSON.stringify({ id: "9", first: 12, after: null }),
    }).toString();

    const { init } = instagram.proximaPagina(
      {
        url: "https://www.instagram.com/graphql/query",
        metodo: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        corpo,
        paramCursor: "after",
        ondeVaiOCursor: "form",
      },
      "CURSOR_ABC",
    );

    const enviado = new URLSearchParams(init.body);
    expect(enviado.get("doc_id")).toBe("123456");
    expect(JSON.parse(enviado.get("variables")).after).toBe("CURSOR_ABC");
    expect(JSON.parse(enviado.get("variables")).first).toBe(12);
  });

  it("põe o cursor direto no form quando não há variables", () => {
    const { init } = instagram.proximaPagina(
      {
        url: "https://www.instagram.com/graphql/query",
        metodo: "POST",
        headers: {},
        corpo: "doc_id=1",
        paramCursor: "after",
        ondeVaiOCursor: "form",
      },
      "C1",
    );
    expect(new URLSearchParams(init.body).get("after")).toBe("C1");
  });

  it("injeta o cursor num corpo JSON", () => {
    const { init } = instagram.proximaPagina(
      {
        url: "https://www.instagram.com/graphql/query",
        metodo: "POST",
        headers: { "content-type": "application/json" },
        corpo: JSON.stringify({ variables: { first: 12 } }),
        paramCursor: "after",
        ondeVaiOCursor: "json",
      },
      "C2",
    );
    expect(JSON.parse(init.body).variables.after).toBe("C2");
  });

  it("sempre manda os cookies da sessão, senão o feed volta vazio", () => {
    const { init } = instagram.proximaPagina(
      {
        url: "https://www.instagram.com/graphql/query",
        metodo: "POST",
        headers: {},
        corpo: "a=1",
        paramCursor: "after",
        ondeVaiOCursor: "form",
      },
      "C",
    );
    expect(init.credentials).toBe("include");
  });

  it("recusa assinatura sem url em vez de montar request inválido", () => {
    expect(() => instagram.proximaPagina({ metodo: "GET" }, "C")).toThrow(/assinatura/i);
  });
});
