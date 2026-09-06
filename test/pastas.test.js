import { describe, it, expect } from "vitest";
import { pastaDoArquivo, sanitizarPasta, caminhoNoZip } from "../src/core/pastas.js";

const args = (p = {}) => ({
  post: { tipo: "foto", id: "ABC" },
  midia: { origem: "publicacao", kind: "foto" },
  ehCapa: false,
  posicao: 7,
  largura: 3,
  ...p,
});

describe("pastaDoArquivo", () => {
  it("separa foto de vídeo no feed", () => {
    // Mudou de proposito: eles tem usos e pesos muito diferentes, e quem foi
    // atras dos videos nao quer garimpa-los no meio de centenas de imagens.
    expect(pastaDoArquivo(args())).toBe("feed/fotos");
    expect(pastaDoArquivo(args({
      post: { tipo: "video", id: "V" },
      midia: { origem: "publicacao", kind: "video" },
    }))).toBe("feed/videos");
  });

  it("separa tambem dentro de um destaque", () => {
    const comum = { post: { tipo: "foto", id: "A", destaque: "Vlogs" } };
    expect(pastaDoArquivo(args({
      ...comum,
      midia: { origem: "destaque", kind: "foto" },
    }))).toBe("destaques/Vlogs/fotos");
    expect(pastaDoArquivo(args({
      ...comum,
      midia: { origem: "destaque", kind: "video" },
    }))).toBe("destaques/Vlogs/videos");
  });

  it("no carrossel o album continua inteiro", () => {
    // A excecao e deliberada: ali a unidade e o album, e separar por tipo
    // desmontaria justamente o que a pasta existe para manter junto.
    const base = { post: { tipo: "carrossel", id: "ABC" }, posicao: 42, largura: 3 };
    expect(pastaDoArquivo(args({
      ...base, midia: { origem: "carrossel", kind: "foto", ordem: 0 },
    }))).toBe(pastaDoArquivo(args({
      ...base, midia: { origem: "carrossel", kind: "video", ordem: 1 },
    })));
  });

  it("dá pasta própria a cada carrossel, para as páginas ficarem juntas", () => {
    const pasta = pastaDoArquivo(args({
      post: { tipo: "carrossel", id: "CAR" },
      midia: { origem: "carrossel", kind: "foto" },
      posicao: 42,
    }));
    expect(pasta).toBe("carrossel/042_CAR");
  });

  it("todas as páginas do mesmo carrossel caem na mesma pasta", () => {
    const base = {
      post: { tipo: "carrossel", id: "CAR" },
      posicao: 42,
    };
    const p1 = pastaDoArquivo(args({ ...base, midia: { origem: "carrossel", ordem: 0 } }));
    const p2 = pastaDoArquivo(args({ ...base, midia: { origem: "carrossel", ordem: 5 } }));
    expect(p1).toBe(p2);
  });

  it("separa a capa de vídeo, que não é publicação de imagem", () => {
    expect(pastaDoArquivo(args({ ehCapa: true }))).toBe("capas");
    expect(pastaDoArquivo(args({ midia: { origem: "capa-de-video" } }))).toBe("capas");
  });

  it("agrupa destaque pelo nome do destaque", () => {
    const pasta = pastaDoArquivo(args({
      post: { tipo: "video", id: "D", destaque: "Viagens 2024" },
      midia: { origem: "destaque", kind: "video" },
    }));
    expect(pasta).toBe("destaques/Viagens 2024/videos");
  });

  it("destaque sem nome não vira pasta vazia", () => {
    // Sem nome de destaque sobra o guarda-chuva, mas a separacao por tipo
    // continua valendo: e ela que faz a pasta ser navegavel.
    expect(pastaDoArquivo(args({
      post: { tipo: "foto", id: "D" },
      midia: { origem: "destaque", kind: "foto" },
    }))).toBe("destaques/fotos");
  });

  it("capa vence carrossel: ela nunca se mistura com as páginas", () => {
    expect(pastaDoArquivo(args({
      post: { tipo: "carrossel", id: "C" },
      midia: { origem: "carrossel" },
      ehCapa: true,
    }))).toBe("capas");
  });

  it("respeita a largura do número do lote", () => {
    expect(pastaDoArquivo(args({
      post: { tipo: "carrossel", id: "C" },
      midia: { origem: "carrossel" },
      posicao: 7,
      largura: 4,
    }))).toBe("carrossel/0007_C");
  });
});

describe("sanitizarPasta", () => {
  it("tira separador de caminho, que criaria pasta fantasma", () => {
    expect(sanitizarPasta("a/b\\c")).toBe("abc");
  });

  it("preserva espaço e acento, que o Windows aceita", () => {
    expect(sanitizarPasta("Viagens de Férias")).toBe("Viagens de Férias");
  });

  it("apara ponto no fim, que o Windows descarta em silêncio", () => {
    expect(sanitizarPasta("nome...")).toBe("nome");
  });

  it("limita o tamanho, para o caminho inteiro não estourar", () => {
    expect(sanitizarPasta("x".repeat(200)).length).toBe(60);
  });

  it("aceita vazio", () => {
    expect(sanitizarPasta("")).toBe("");
    expect(sanitizarPasta(null)).toBe("");
  });
});

describe("caminhoNoZip", () => {
  it("junta com barra", () => {
    expect(caminhoNoZip("feed", "a.jpg")).toBe("feed/a.jpg");
  });

  it("sem pasta devolve só o nome", () => {
    expect(caminhoNoZip("", "a.jpg")).toBe("a.jpg");
  });
});
