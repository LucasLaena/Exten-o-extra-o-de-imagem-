import { describe, it, expect, vi } from "vitest";
import { criarBuscadorDeMidia, ErroDePrazo, PRAZO_MS } from "../src/acervo/midia.js";

/** Relógio de mentira: dispara quando o teste mandar, não quando der a hora. */
function relogioFalso() {
  const pendentes = new Map();
  let n = 0;
  return {
    agendar: vi.fn((fn) => { pendentes.set(++n, fn); return n; }),
    cancelarAgenda: vi.fn((id) => pendentes.delete(id)),
    estourarTudo() { for (const fn of pendentes.values()) fn(); },
    pendentes,
  };
}

const respostaOk = (corpo = "bytes") => ({
  ok: true,
  status: 200,
  blob: async () => corpo,
});

describe("buscar mídia com prazo", () => {
  it("devolve os bytes quando o CDN responde", async () => {
    const buscar = vi.fn().mockResolvedValue(respostaOk("imagem"));
    const buscarMidia = criarBuscadorDeMidia({ buscar });

    expect(await buscarMidia("https://cdn.test/a.jpg")).toBe("imagem");
  });

  it("desiste no prazo em vez de pendurar o download inteiro", async () => {
    // Foi o que travou a janela em "Preparando...": um arquivo que nunca
    // responde, e nada para cortar a espera.
    const relogio = relogioFalso();
    const buscar = vi.fn((url, init) =>
      new Promise((_, rejeitar) => {
        init.signal.addEventListener("abort", () =>
          rejeitar(new DOMException("Aborted", "AbortError")));
      }));

    const buscarMidia = criarBuscadorDeMidia({ buscar, ...relogio, prazoMs: 1000 });
    const promessa = buscarMidia("https://cdn.test/travado.jpg");
    relogio.estourarTudo();

    const erro = await promessa.catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDePrazo);
    expect(erro.message).toContain("1s");
  });

  it("cancelar a coleta corta a requisição, que senão segue baixando", async () => {
    const controle = new AbortController();
    const buscar = vi.fn((url, init) =>
      new Promise((_, rejeitar) => {
        init.signal.addEventListener("abort", () => rejeitar(new Error("cortado")));
      }));

    const buscarMidia = criarBuscadorDeMidia({ buscar, ...relogioFalso() });
    const promessa = buscarMidia("https://cdn.test/a.jpg", controle.signal);
    controle.abort();

    await expect(promessa).rejects.toThrow("cortado");
  });

  it("nem tenta quando o cancelamento já veio", async () => {
    const controle = new AbortController();
    controle.abort();
    const buscar = vi.fn();

    await expect(
      criarBuscadorDeMidia({ buscar })("https://cdn.test/a.jpg", controle.signal),
    ).rejects.toThrow(/cancelado/i);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("diz o status quando o CDN recusa", async () => {
    const buscar = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(
      criarBuscadorDeMidia({ buscar })("https://cdn.test/a.jpg"),
    ).rejects.toThrow("403");
  });

  it("erro de rede sobe como veio, sem virar prazo", async () => {
    // Confundir os dois manda procurar a causa no lugar errado.
    const buscar = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const erro = await criarBuscadorDeMidia({ buscar, ...relogioFalso() })
      .call(null, "https://cdn.test/a.jpg")
      .catch((e) => e);

    expect(erro).not.toBeInstanceOf(ErroDePrazo);
    expect(erro.message).toContain("Failed to fetch");
  });

  it("desarma o relógio ao terminar, para não vazar temporizador", async () => {
    const relogio = relogioFalso();
    const buscar = vi.fn().mockResolvedValue(respostaOk());

    await criarBuscadorDeMidia({ buscar, ...relogio })("https://cdn.test/a.jpg");

    expect(relogio.cancelarAgenda).toHaveBeenCalled();
    expect(relogio.pendentes.size).toBe(0);
  });

  it("o prazo padrão é generoso, mas existe", () => {
    // Video grande em rede ruim demora; travar para sempre nao e opcao.
    expect(PRAZO_MS).toBeGreaterThan(10_000);
    expect(PRAZO_MS).toBeLessThanOrEqual(120_000);
  });
});
