import { describe, it, expect, vi } from "vitest";
import { criarTransporteViaHook } from "../src/acervo/transporte.js";

describe("criarTransporteViaHook", () => {
  it("manda o pedido para a aba do perfil e devolve o JSON", async () => {
    const enviar = vi.fn().mockResolvedValue({ ok: true, status: 200, json: { a: 1 } });
    const transporte = criarTransporteViaHook({ abaAlvo: 9, enviar });

    const r = await transporte("https://feed.test/p", { method: "GET" });

    expect(enviar).toHaveBeenCalledWith(expect.objectContaining({
      tipo: "paginar", abaAlvo: 9, url: "https://feed.test/p",
    }));
    expect(r).toEqual({ ok: true, status: 200, json: { a: 1 } });
  });

  it("dá um id único a cada pedido, para as respostas não se cruzarem", async () => {
    const enviar = vi.fn().mockResolvedValue({ ok: true, status: 200, json: {} });
    const transporte = criarTransporteViaHook({ abaAlvo: 9, enviar });
    await transporte("https://a.test", {});
    await transporte("https://b.test", {});
    const ids = enviar.mock.calls.map((c) => c[0].id);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("trata resposta ausente como falha, não como sucesso vazio", async () => {
    const enviar = vi.fn().mockResolvedValue(undefined);
    const transporte = criarTransporteViaHook({ abaAlvo: 9, enviar });
    const r = await transporte("https://a.test", {});
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
  });

  it("propaga a falha de mensageria como resposta ruim", async () => {
    const enviar = vi.fn().mockRejectedValue(new Error("aba fechou"));
    const transporte = criarTransporteViaHook({ abaAlvo: 9, enviar });
    const r = await transporte("https://a.test", {});
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("aba fechou");
  });

  it("desiste depois do tempo limite em vez de pendurar a indexação", async () => {
    vi.useFakeTimers();
    const enviar = vi.fn(() => new Promise(() => {}));
    const transporte = criarTransporteViaHook({ abaAlvo: 9, enviar, tempoLimite: 5000 });
    const promessa = transporte("https://a.test", {});
    await vi.advanceTimersByTimeAsync(5001);
    const r = await promessa;
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/tempo/i);
    vi.useRealTimers();
  });
});
