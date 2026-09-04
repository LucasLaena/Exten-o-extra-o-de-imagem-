import { describe, it, expect } from "vitest";
import {
  PADROES_DE_FEED,
  pareceFeed,
  detectarCursor,
  montarAssinatura,
  HEADERS_RELEVANTES,
} from "../src/core/assinatura.js";

describe("pareceFeed", () => {
  it.each([
    "https://www.instagram.com/graphql/query",
    "https://www.instagram.com/graphql/query/?doc_id=1",
    "https://i.instagram.com/api/v1/feed/user/123/",
    "https://www.tiktok.com/api/post/item_list/?cursor=0",
  ])("aceita %s", (url) => {
    expect(pareceFeed(url)).toBe(true);
  });

  it.each([
    "https://www.instagram.com/api/v1/users/web_profile_info/",
    "https://www.tiktok.com/api/recommend/item_list/",
    "https://cdn.test/a.mp4",
    "",
  ])("recusa %s", (url) => {
    expect(pareceFeed(url)).toBe(false);
  });

  it("expõe os padrões para o hook copiar", () => {
    expect(PADROES_DE_FEED.length).toBeGreaterThan(0);
    expect(PADROES_DE_FEED.every((p) => p instanceof RegExp)).toBe(true);
  });
});

describe("detectarCursor", () => {
  it("acha 'after' dentro de variables num corpo form do graphql", () => {
    const corpo = new URLSearchParams({
      doc_id: "1",
      variables: JSON.stringify({ id: "9", first: 12, after: null }),
    }).toString();
    expect(detectarCursor({ url: "https://www.instagram.com/graphql/query", corpo }))
      .toEqual({ paramCursor: "after", ondeVaiOCursor: "form" });
  });

  it("acha 'after' num corpo JSON do graphql", () => {
    const corpo = JSON.stringify({ variables: { first: 12, after: null } });
    expect(detectarCursor({ url: "https://www.instagram.com/graphql/query", corpo }))
      .toEqual({ paramCursor: "after", ondeVaiOCursor: "json" });
  });

  it("assume form no graphql sem corpo reconhecível", () => {
    expect(detectarCursor({ url: "https://www.instagram.com/graphql/query", corpo: "x=1" }))
      .toEqual({ paramCursor: "after", ondeVaiOCursor: "form" });
  });

  it("usa max_id na query do feed REST do Instagram", () => {
    expect(detectarCursor({ url: "https://i.instagram.com/api/v1/feed/user/9/?count=12" }))
      .toEqual({ paramCursor: "max_id", ondeVaiOCursor: "query" });
  });

  it("usa cursor na query do item_list do TikTok", () => {
    expect(detectarCursor({ url: "https://www.tiktok.com/api/post/item_list/?cursor=0" }))
      .toEqual({ paramCursor: "cursor", ondeVaiOCursor: "query" });
  });

  it("devolve null para url que não é feed", () => {
    expect(detectarCursor({ url: "https://cdn.test/a.mp4" })).toBeNull();
  });

  it("não quebra com corpo JSON malformado", () => {
    expect(detectarCursor({ url: "https://www.instagram.com/graphql/query", corpo: "{ nao é json" }))
      .toEqual({ paramCursor: "after", ondeVaiOCursor: "form" });
  });
});

describe("montarAssinatura", () => {
  const bruto = {
    url: "https://www.instagram.com/graphql/query",
    metodo: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-ig-app-id": "936619743392459",
      "x-csrftoken": "abc",
      "content-length": "412",
      "user-agent": "Mozilla/5.0",
      "cookie": "sessionid=SEGREDO",
    },
    corpo: new URLSearchParams({
      doc_id: "1",
      variables: JSON.stringify({ after: null }),
    }).toString(),
  };

  it("preserva url, método e corpo", () => {
    const a = montarAssinatura(bruto);
    expect(a.url).toBe(bruto.url);
    expect(a.metodo).toBe("POST");
    expect(a.corpo).toBe(bruto.corpo);
  });

  it("anexa onde o cursor mora", () => {
    const a = montarAssinatura(bruto);
    expect(a.paramCursor).toBe("after");
    expect(a.ondeVaiOCursor).toBe("form");
  });

  it("mantém os headers que o endpoint exige", () => {
    const a = montarAssinatura(bruto);
    expect(a.headers["x-ig-app-id"]).toBe("936619743392459");
    expect(a.headers["x-csrftoken"]).toBe("abc");
    expect(a.headers["content-type"]).toBe("application/x-www-form-urlencoded");
  });

  it("descarta content-length, que ficaria errado ao trocar o cursor", () => {
    expect(montarAssinatura(bruto).headers["content-length"]).toBeUndefined();
  });

  it("nunca copia o cookie: o navegador anexa sozinho e nós não tocamos em credencial", () => {
    const a = montarAssinatura(bruto);
    expect(a.headers.cookie).toBeUndefined();
    expect(JSON.stringify(a)).not.toContain("SEGREDO");
  });

  it("normaliza o nome dos headers para minúsculo", () => {
    const a = montarAssinatura({ ...bruto, headers: { "X-IG-App-ID": "9" } });
    expect(a.headers["x-ig-app-id"]).toBe("9");
  });

  it("devolve null quando a url não é de feed", () => {
    expect(montarAssinatura({ ...bruto, url: "https://cdn.test/a.mp4" })).toBeNull();
  });

  it("a lista de headers relevantes é minúscula e sem cookie", () => {
    expect(HEADERS_RELEVANTES).not.toContain("cookie");
    expect(HEADERS_RELEVANTES.every((h) => h === h.toLowerCase())).toBe(true);
  });
});
