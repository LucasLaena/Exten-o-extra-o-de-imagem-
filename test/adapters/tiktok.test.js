import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { tiktok } from "../../src/adapters/tiktok.js";
import { criarPost, criarMidia } from "../apoio/fabrica.js";

const fixture = JSON.parse(readFileSync("test/fixtures/tt-item-list.json", "utf8"));

describe("ehRespostaDeFeed", () => {
  it.each([
    "https://www.tiktok.com/api/post/item_list/?secUid=x&cursor=0",
    "https://us.tiktok.com/api/post/item_list/",
  ])("aceita %s", (url) => {
    expect(tiktok.ehRespostaDeFeed(url)).toBe(true);
  });

  it.each([
    "https://www.tiktok.com/api/recommend/item_list/",
    "https://www.tiktok.com/api/user/detail/",
    "https://cdn.tiktok.test/video.mp4",
  ])("recusa %s", (url) => {
    expect(tiktok.ehRespostaDeFeed(url)).toBe(false);
  });
});

describe("parsear", () => {
  const r = tiktok.parsear(fixture);

  it("acha os três posts", () => {
    expect(r.itens.map((p) => p.id)).toEqual([
      "7300000000000000001", "7300000000000000002", "7300000000000000003",
    ]);
  });

  it("lê o cursor e o hasMore", () => {
    expect(r.cursor).toBe("1708000000000");
    expect(r.temMais).toBe(true);
  });

  it("mapeia as estatísticas para as nossas métricas", () => {
    const [primeiro] = r.itens;
    expect(primeiro.curtidas).toBe(12345);
    expect(primeiro.views).toBe(987654);
    expect(primeiro.comentarios).toBe(42);
    expect(primeiro.timestamp).toBe(1710253800);
    expect(primeiro.legenda).toBe("primeiro video");
  });

  it("prefere o endereço sem marca d'água", () => {
    expect(r.itens[0].midias[0].url).toBe("https://cdn.tiktok.test/sem-marca-1.mp4");
    expect(r.itens[0].comMarcaDagua).toBe(false);
  });

  it("cai no playAddr e marca o post quando não há alternativa", () => {
    expect(r.itens[1].midias[0].url).toBe("https://cdn.tiktok.test/com-marca-2.mp4");
    expect(r.itens[1].comMarcaDagua).toBe(true);
  });

  it("reconhece slideshow de fotos como carrossel", () => {
    const slideshow = r.itens[2];
    expect(slideshow.tipo).toBe("carrossel");
    expect(slideshow.midias.map((m) => m.kind)).toEqual(["foto", "foto"]);
    expect(slideshow.midias.map((m) => m.ordem)).toEqual([0, 1]);
    expect(slideshow.midias[0].url).toBe("https://cdn.tiktok.test/slide-1.jpg");
  });

  it("guarda a capa de todo post", () => {
    expect(r.itens.map((p) => p.capaUrl)).toEqual([
      "https://cdn.tiktok.test/capa-1.jpg",
      "https://cdn.tiktok.test/capa-2.jpg",
      "https://cdn.tiktok.test/capa-3.jpg",
    ]);
  });

  it("guarda a duração do vídeo", () => {
    expect(r.itens[0].midias[0].duracao).toBe(31);
  });

  it("aceita itemList aninhado em data, que algumas rotas usam", () => {
    const r2 = tiktok.parsear({ data: { itemList: fixture.itemList, hasMore: false } });
    expect(r2.itens).toHaveLength(3);
    expect(r2.temMais).toBe(false);
  });

  it("devolve vazio para JSON que não é feed", () => {
    expect(tiktok.parsear({ statusCode: 10101 }).itens).toEqual([]);
    expect(tiktok.parsear(null).itens).toEqual([]);
  });

  it("pula item sem mídia utilizável", () => {
    const r2 = tiktok.parsear({ itemList: [{ id: "1", stats: {}, video: {} }] });
    expect(r2.itens).toEqual([]);
  });
});

describe("midiasParaBaixar", () => {
  const opcoes = (p = {}) => ({ filtro: "ambos", incluirCapaReel: false, ...p });
  const video = () =>
    criarPost({
      tipo: "video",
      capaUrl: "https://cdn.tiktok.test/c.jpg",
      midias: [criarMidia({ ordem: 0, kind: "video" })],
    });
  const slideshow = () =>
    criarPost({
      tipo: "carrossel",
      midias: [criarMidia({ ordem: 0, kind: "foto" }), criarMidia({ ordem: 1, kind: "foto" })],
    });

  it("com 'ambos' pega tudo", () => {
    expect(tiktok.midiasParaBaixar(video(), opcoes())).toHaveLength(1);
    expect(tiktok.midiasParaBaixar(slideshow(), opcoes())).toHaveLength(2);
  });

  it("com 'fotos' descarta o vídeo e mantém o slideshow", () => {
    expect(tiktok.midiasParaBaixar(video(), opcoes({ filtro: "fotos" }))).toEqual([]);
    expect(tiktok.midiasParaBaixar(slideshow(), opcoes({ filtro: "fotos" }))).toHaveLength(2);
  });

  it("com 'videos' descarta o slideshow", () => {
    expect(tiktok.midiasParaBaixar(slideshow(), opcoes({ filtro: "videos" }))).toEqual([]);
    expect(tiktok.midiasParaBaixar(video(), opcoes({ filtro: "videos" }))).toHaveLength(1);
  });

  it("acrescenta a capa quando pedido, igual ao Instagram", () => {
    const r = tiktok.midiasParaBaixar(video(), opcoes({ incluirCapaReel: true }));
    expect(r).toHaveLength(2);
    expect(r[1].ehCapa).toBe(true);
  });
});

describe("proximaPagina", () => {
  it("troca o cursor na query string", () => {
    const { url, init } = tiktok.proximaPagina(
      {
        url: "https://www.tiktok.com/api/post/item_list/?secUid=ABC&cursor=0&count=35",
        metodo: "GET",
        headers: { "x-tt-params": "opaco" },
        corpo: null,
        paramCursor: "cursor",
        ondeVaiOCursor: "query",
      },
      "1708000000000",
    );

    const u = new URL(url);
    expect(u.searchParams.get("cursor")).toBe("1708000000000");
    expect(u.searchParams.get("secUid")).toBe("ABC");
    expect(u.searchParams.get("count")).toBe("35");
    expect(init.headers["x-tt-params"]).toBe("opaco");
    expect(init.credentials).toBe("include");
  });

  it("recusa assinatura sem url", () => {
    expect(() => tiktok.proximaPagina({}, "C")).toThrow(/assinatura/i);
  });
});
