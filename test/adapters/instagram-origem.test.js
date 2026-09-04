import { describe, it, expect } from "vitest";
import { instagram } from "../../src/adapters/instagram.js";

const soCapa = (code) => ({
  pk: code,
  code,
  media_type: 2, // o item se declara vídeo
  taken_at: 1,
  image_versions2: { candidates: [{ url: "https://cdn.test/capa.jpg", width: 1080 }] },
  // e não traz video_versions
});

const videoNormal = (code) => ({
  pk: code,
  code,
  media_type: 2,
  taken_at: 1,
  image_versions2: { candidates: [{ url: "https://cdn.test/capa.jpg", width: 1080 }] },
  video_versions: [{ url: "https://cdn.test/v.mp4", width: 1080, type: 102 }],
});

const fotoDeVerdade = (code) => ({
  pk: code,
  code,
  media_type: 1,
  taken_at: 1,
  image_versions2: { candidates: [{ url: "https://cdn.test/f.jpg", width: 1080 }] },
});

describe("vídeo sem endereço de vídeo", () => {
  it("não vira foto: a capa de um Reel não é uma publicação de imagem", () => {
    // Era o bug: o filtro "só fotos" trazia thumbnail de vídeo, que não é
    // imagem de verdade nenhuma.
    const r = instagram.parsear({ items: [soCapa("SEMVIDEO")] });
    expect(r.itens).toHaveLength(0);
  });

  it("não confunde com o vídeo normal, que continua entrando", () => {
    const r = instagram.parsear({ items: [videoNormal("OK")] });
    expect(r.itens[0].midias[0].kind).toBe("video");
    expect(r.itens[0].midias[0].url).toBe("https://cdn.test/v.mp4");
  });

  it("dentro do carrossel também não vira foto", () => {
    const r = instagram.parsear({
      items: [{
        pk: "C", code: "C", media_type: 8, taken_at: 1,
        image_versions2: { candidates: [{ url: "https://cdn.test/capa.jpg", width: 10 }] },
        carousel_media: [
          { media_type: 1, image_versions2: { candidates: [{ url: "https://cdn.test/1.jpg", width: 10 }] } },
          soCapa("filho-video"),
        ],
      }],
    });
    expect(r.itens[0].midias.map((m) => m.kind)).toEqual(["foto"]);
  });
});

describe("origem de cada mídia", () => {
  it("marca a foto de publicação como vinda do feed", () => {
    const r = instagram.parsear({ items: [fotoDeVerdade("F")] });
    expect(r.itens[0].midias[0].origem).toBe("publicacao");
  });

  it("marca a foto de carrossel como tal", () => {
    const r = instagram.parsear({
      items: [{
        pk: "C", code: "C", media_type: 8, taken_at: 1,
        carousel_media: [
          { media_type: 1, image_versions2: { candidates: [{ url: "https://cdn.test/1.jpg", width: 10 }] } },
        ],
      }],
    });
    expect(r.itens[0].midias[0].origem).toBe("carrossel");
  });

  it("marca a capa acrescentada como capa de vídeo, não como publicação", () => {
    const post = instagram.parsear({ items: [videoNormal("V")] }).itens[0];
    const escolhidas = instagram.midiasParaBaixar(
      { ...post, key: "k", profileKey: "p", seq: 1 },
      { filtro: "ambos", incluirCapaReel: true },
    );
    const capa = escolhidas.find((e) => e.ehCapa);
    expect(capa.midia.origem).toBe("capa-de-video");
  });
});

describe("filtro de fotos reais", () => {
  it("'fotos' não traz nada de um perfil só de Reels", () => {
    const r = instagram.parsear({ items: [videoNormal("A"), videoNormal("B")] });
    for (const post of r.itens) {
      const escolhidas = instagram.midiasParaBaixar(
        { ...post, key: "k", profileKey: "p", seq: 1 },
        { filtro: "fotos", incluirCapaReel: false },
      );
      expect(escolhidas).toEqual([]);
    }
  });

  it("'fotos' com capa ligada continua sem trazer capa, que não é foto de verdade", () => {
    const post = instagram.parsear({ items: [videoNormal("V")] }).itens[0];
    const escolhidas = instagram.midiasParaBaixar(
      { ...post, key: "k", profileKey: "p", seq: 1 },
      { filtro: "fotos", incluirCapaReel: true },
    );
    expect(escolhidas).toEqual([]);
  });
});
