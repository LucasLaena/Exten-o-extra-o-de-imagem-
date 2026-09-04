import { describe, it, expect, beforeAll, vi } from "vitest";

/**
 * Arquivo separado de propósito: cada arquivo de teste ganha um jsdom limpo, e
 * este precisa de um hook que ainda não capturou nada. No arquivo principal os
 * testes anteriores já teriam preenchido a última captura.
 */
beforeAll(async () => {
  window.fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  await import("../../src/page/hook.js");
});

describe("repetir a última captura, sem nada capturado", () => {
  it("fica quieto em vez de anunciar captura vazia", async () => {
    const veioAlgo = new Promise((resolve) => {
      const ouvir = (ev) => {
        if (ev.data?.fonte === "acervo/pagina" && ev.data?.tipo === "capturou") {
          window.removeEventListener("message", ouvir);
          resolve("veio");
        }
      };
      window.addEventListener("message", ouvir);
      setTimeout(() => {
        window.removeEventListener("message", ouvir);
        resolve("nada");
      }, 150);
    });

    window.postMessage({ fonte: "acervo/conteudo", tipo: "pedirUltimaCaptura" }, "*");
    expect(await veioAlgo).toBe("nada");
  });
});
