import { describe, it, expect } from "vitest";
import { destaques, ehDestaque, idDoDestaque, parsearDestaque } from "../../src/adapters/destaques.js";

describe("reconhecer a URL do destaque", () => {
  it.each([
    "https://www.instagram.com/stories/highlights/18012345678901234/",
    "https://www.instagram.com/stories/highlights/18012345678901234",
    "https://instagram.com/stories/highlights/999/?x=1",
  ])("aceita %s", (url) => {
    expect(ehDestaque(url)).toBe(true);
  });

  it.each([
    "https://www.instagram.com/fulano/",
    "https://www.instagram.com/stories/fulano/123/",
    "https://www.instagram.com/p/ABC/",
    "https://outrosite.com/stories/highlights/1/",
  ])("recusa %s", (url) => {
    expect(ehDestaque(url)).toBe(false);
  });

  it("extrai o id", () => {
    expect(idDoDestaque("https://www.instagram.com/stories/highlights/18012345678901234/"))
      .toBe("18012345678901234");
    expect(idDoDestaque("https://www.instagram.com/fulano/")).toBeNull();
  });
});

const resposta = (itens, titulo = "Viagens") => ({
  reels: {
    "highlight:999": { id: "highlight:999", title: titulo, items: itens },
  },
});

const foto = (pk) => ({
  pk, media_type: 1, taken_at: 10,
  image_versions2: { candidates: [
    { url: "https://cdn.test/p.jpg", width: 320 },
    { url: "https://cdn.test/g.jpg", width: 1080 },
  ]},
});

const video = (pk) => ({
  pk, media_type: 2, taken_at: 20, video_duration: 8,
  image_versions2: { candidates: [{ url: "https://cdn.test/capa.jpg", width: 1080 }] },
  video_versions: [
    { url: "https://cdn.test/baixa.mp4", width: 480 },
    { url: "https://cdn.test/alta.mp4", width: 1080 },
  ],
});

describe("parsearDestaque", () => {
  it("lê o título e todos os itens", () => {
    const r = parsearDestaque(resposta([foto("1"), video("2")]), "999");
    expect(r.titulo).toBe("Viagens");
    expect(r.itens.map((i) => i.id)).toEqual(["1", "2"]);
  });

  it("escolhe a maior resolução de cada mídia", () => {
    const r = parsearDestaque(resposta([foto("1"), video("2")]), "999");
    expect(r.itens[0].midias[0].url).toBe("https://cdn.test/g.jpg");
    expect(r.itens[1].midias[0].url).toBe("https://cdn.test/alta.mp4");
  });

  it("marca tudo como vindo do destaque, para separar na pasta", () => {
    const r = parsearDestaque(resposta([foto("1")]), "999");
    expect(r.itens[0].midias[0].origem).toBe("destaque");
    expect(r.itens[0].destaque).toBe("Viagens");
  });

  it("vídeo sem endereço de vídeo não vira foto, igual ao feed", () => {
    const semVideo = { pk: "3", media_type: 2, taken_at: 1,
      image_versions2: { candidates: [{ url: "https://cdn.test/capa.jpg", width: 1080 }] } };
    expect(parsearDestaque(resposta([semVideo]), "999").itens).toHaveLength(0);
  });

  it("aceita a coleção vindo como lista, que algumas rotas usam", () => {
    const r = parsearDestaque({ reels_media: [{ title: "Outro", items: [foto("9")] }] }, "999");
    expect(r.titulo).toBe("Outro");
    expect(r.itens).toHaveLength(1);
  });

  it("devolve vazio para resposta que não é destaque", () => {
    expect(parsearDestaque({}, "999").itens).toEqual([]);
    expect(parsearDestaque(null, "999").itens).toEqual([]);
  });

  it("guarda a duração do vídeo", () => {
    const r = parsearDestaque(resposta([video("2")]), "999");
    expect(r.itens[0].midias[0].duracao).toBe(8);
  });
});

describe("midiasParaBaixar", () => {
  const itens = () => parsearDestaque(resposta([foto("1"), video("2")]), "999").itens;

  it("com 'ambos' leva tudo", () => {
    const todas = itens().flatMap((i) => destaques.midiasParaBaixar(i, { filtro: "ambos" }));
    expect(todas).toHaveLength(2);
  });

  it("filtra por tipo, que continua valendo dentro do destaque", () => {
    const soFotos = itens().flatMap((i) => destaques.midiasParaBaixar(i, { filtro: "fotos" }));
    expect(soFotos).toHaveLength(1);
    expect(soFotos[0].midia.kind).toBe("foto");
  });

  it("nunca acrescenta capa: num destaque não existe essa opção", () => {
    const todas = itens().flatMap((i) =>
      destaques.midiasParaBaixar(i, { filtro: "ambos", incluirCapaReel: true }),
    );
    expect(todas.every((e) => e.ehCapa === false)).toBe(true);
    expect(todas).toHaveLength(2);
  });
});
