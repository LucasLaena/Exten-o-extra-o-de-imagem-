import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { instagram } from "../../src/adapters/instagram.js";

const fixture = (nome) =>
  JSON.parse(readFileSync(`test/fixtures/${nome}.json`, "utf8"));

describe("ehRespostaDeFeed", () => {
  it.each([
    "https://www.instagram.com/graphql/query",
    "https://www.instagram.com/graphql/query/?doc_id=123",
    "https://www.instagram.com/api/v1/feed/user/12345/",
    "https://i.instagram.com/api/v1/feed/user/12345/?count=12",
  ])("aceita %s", (url) => {
    expect(instagram.ehRespostaDeFeed(url)).toBe(true);
  });

  it.each([
    "https://www.instagram.com/api/v1/users/web_profile_info/",
    "https://www.instagram.com/ajax/bulk-route-definitions/",
    "https://cdn.test/video.mp4",
  ])("recusa %s", (url) => {
    expect(instagram.ehRespostaDeFeed(url)).toBe(false);
  });
});

describe("parsear — formato graphql atual", () => {
  const r = instagram.parsear(fixture("ig-graphql-v1"));

  it("acha os três posts", () => {
    expect(r.itens).toHaveLength(3);
    expect(r.itens.map((p) => p.id)).toEqual(["CvIDEO1", "CvFOTO1", "CvCARR1"]);
  });

  it("lê o cursor e o indicador de mais páginas", () => {
    expect(r.cursor).toBe("CURSOR_ABC");
    expect(r.temMais).toBe(true);
  });

  it("classifica os três tipos de mídia", () => {
    expect(r.itens.map((p) => p.tipo)).toEqual(["video", "foto", "carrossel"]);
  });

  it("extrai as métricas que permitem ordenar por relevância", () => {
    const [reel] = r.itens;
    expect(reel.curtidas).toBe(4210);
    expect(reel.views).toBe(98765);
    expect(reel.comentarios).toBe(87);
    expect(reel.timestamp).toBe(1710253800);
  });

  it("usa 0 de views quando a plataforma não informa, como em foto", () => {
    expect(r.itens[1].views).toBe(0);
  });

  it("escolhe a maior resolução de vídeo disponível", () => {
    expect(r.itens[0].midias[0].url).toBe("https://cdn.test/video-alta.mp4");
    expect(r.itens[0].midias[0].largura).toBe(1080);
  });

  it("escolhe a maior resolução de imagem disponível", () => {
    expect(r.itens[1].midias[0].url).toBe("https://cdn.test/foto.jpg");
  });

  it("guarda a capa do vídeo separada da mídia", () => {
    expect(r.itens[0].capaUrl).toBe("https://cdn.test/capa-grande.jpg");
  });

  it("expande o carrossel em várias mídias, na ordem", () => {
    const carrossel = r.itens[2];
    expect(carrossel.midias).toHaveLength(2);
    expect(carrossel.midias.map((m) => m.kind)).toEqual(["foto", "video"]);
    expect(carrossel.midias.map((m) => m.ordem)).toEqual([0, 1]);
    expect(carrossel.midias[1].url).toBe("https://cdn.test/carr-2.mp4");
  });

  it("trata legenda ausente como string vazia", () => {
    expect(r.itens[2].legenda).toBe("");
  });

  it("guarda a duração do vídeo", () => {
    expect(r.itens[0].midias[0].duracao).toBeCloseTo(22.5);
  });
});

describe("parsear — formato graphql legado", () => {
  const r = instagram.parsear(fixture("ig-graphql-legacy"));

  it("acha os posts pelo shortcode", () => {
    expect(r.itens.map((p) => p.id)).toEqual(["LEGVID", "LEGCAR"]);
  });

  it("mapeia __typename para o nosso tipo", () => {
    expect(r.itens.map((p) => p.tipo)).toEqual(["video", "carrossel"]);
  });

  it("lê curtidas, views e comentários das arestas", () => {
    expect(r.itens[0].curtidas).toBe(77);
    expect(r.itens[0].views).toBe(5000);
    expect(r.itens[0].comentarios).toBe(9);
  });

  it("lê a legenda da primeira aresta de caption", () => {
    expect(r.itens[0].legenda).toBe("legado");
    expect(r.itens[1].legenda).toBe("");
  });

  it("expande o sidecar", () => {
    expect(r.itens[1].midias.map((m) => m.kind)).toEqual(["foto", "video"]);
  });

  it("sinaliza fim de paginação", () => {
    expect(r.temMais).toBe(false);
    expect(r.cursor).toBeNull();
  });

  it("informa o total declarado pelo perfil quando existe", () => {
    expect(r.totalDeclarado).toBe(3120);
  });
});

describe("parsear — formato REST", () => {
  const r = instagram.parsear(fixture("ig-rest-v1"));

  it("acha o post em items[]", () => {
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].id).toBe("RESTVID");
    expect(r.itens[0].views).toBe(340);
  });

  it("usa next_max_id como cursor", () => {
    expect(r.cursor).toBe("MAXID_XYZ");
    expect(r.temMais).toBe(true);
  });
});

describe("parsear — entradas ruins", () => {
  it("devolve vazio para JSON que não é feed", () => {
    const r = instagram.parsear({ data: { qualquer: "coisa" } });
    expect(r.itens).toEqual([]);
    expect(r.temMais).toBe(false);
  });

  it("devolve vazio para null e para tipo errado", () => {
    expect(instagram.parsear(null).itens).toEqual([]);
    expect(instagram.parsear("texto").itens).toEqual([]);
  });

  it("pula um item sem nenhuma mídia utilizável em vez de quebrar", () => {
    const r = instagram.parsear({
      items: [
        { pk: "1", code: "BOM", media_type: 1,
          image_versions2: { candidates: [{ url: "https://cdn.test/a.jpg", width: 10, height: 10 }] } },
        { pk: "2", code: "RUIM", media_type: 1, image_versions2: { candidates: [] } },
      ],
    });
    expect(r.itens.map((p) => p.id)).toEqual(["BOM"]);
  });

  it("aceita item sem contadores, zerando as métricas", () => {
    const r = instagram.parsear({
      items: [{ pk: "1", code: "X", media_type: 1, taken_at: 5,
        image_versions2: { candidates: [{ url: "https://cdn.test/a.jpg" }] } }],
    });
    expect(r.itens[0].curtidas).toBe(0);
    expect(r.itens[0].views).toBe(0);
    expect(r.itens[0].comentarios).toBe(0);
  });
});
