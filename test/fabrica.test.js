import { describe, it, expect } from "vitest";
import { criarPost, criarPosts, criarMidia } from "./apoio/fabrica.js";

describe("fábrica de posts", () => {
  it("cria um post de vídeo válido por padrão", () => {
    const post = criarPost();
    expect(post.key).toMatch(/^ig:@\w+#\w+$/);
    expect(post.tipo).toBe("video");
    expect(post.midias).toHaveLength(1);
    expect(post.midias[0].kind).toBe("video");
    expect(typeof post.seq).toBe("number");
  });

  it("aceita sobrescrita parcial sem perder os outros campos", () => {
    const post = criarPost({ curtidas: 999, tipo: "foto" });
    expect(post.curtidas).toBe(999);
    expect(post.tipo).toBe("foto");
    expect(post.views).toBe(0);
    expect(post.legenda).toBeTypeOf("string");
  });

  it("gera chaves e seq únicos em lote", () => {
    const posts = criarPosts(50);
    expect(new Set(posts.map((p) => p.key)).size).toBe(50);
    expect(posts.map((p) => p.seq)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
  });

  it("aceita função de personalização por índice", () => {
    const posts = criarPosts(3, (i) => ({ curtidas: i * 10 }));
    expect(posts.map((p) => p.curtidas)).toEqual([0, 10, 20]);
  });

  it("cria mídia de foto sob demanda", () => {
    const midia = criarMidia({ kind: "foto" });
    expect(midia.kind).toBe("foto");
    expect(midia.url).toMatch(/^https:\/\//);
  });
});
