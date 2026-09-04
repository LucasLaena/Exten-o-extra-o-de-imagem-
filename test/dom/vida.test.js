import { describe, it, expect, vi } from "vitest";
import { extensaoViva, criarMensageiro } from "../../src/content/vida.js";

const viva = () => ({ runtime: { id: "abc", sendMessage: vi.fn().mockResolvedValue("ok") } });
const morta = () => ({ runtime: { sendMessage: vi.fn() } });

describe("extensaoViva", () => {
  it("reconhece a extensão viva pelo id", () => {
    expect(extensaoViva(viva())).toBe(true);
  });

  it("reconhece a extensão morta: o id some quando ela é recarregada", () => {
    expect(extensaoViva(morta())).toBe(false);
    expect(extensaoViva({})).toBe(false);
    expect(extensaoViva(null)).toBe(false);
  });
});

describe("desmontagem sem clique", () => {
  it("a checagem é barata o bastante para rodar na sondagem", () => {
    // extensaoViva é só uma leitura de propriedade: pode rodar a cada 400ms
    // sem custo, que é o que permite o órfão sumir sozinho.
    const api = viva();
    const antes = performance.now();
    for (let i = 0; i < 10000; i++) extensaoViva(api);
    expect(performance.now() - antes).toBeLessThan(100);
  });
});

describe("criarMensageiro", () => {
  it("entrega a mensagem enquanto a extensão vive", async () => {
    const api = viva();
    const aoMorrer = vi.fn();
    const enviar = criarMensageiro(api, aoMorrer);

    expect(await enviar({ tipo: "catalogo" })).toBe("ok");
    expect(api.runtime.sendMessage).toHaveBeenCalledWith({ tipo: "catalogo" });
    expect(aoMorrer).not.toHaveBeenCalled();
  });

  it("nem tenta enviar quando a extensão já morreu", async () => {
    const api = morta();
    const aoMorrer = vi.fn();
    const enviar = criarMensageiro(api, aoMorrer);

    expect(await enviar({ tipo: "catalogo" })).toBeNull();
    expect(api.runtime.sendMessage).not.toHaveBeenCalled();
    expect(aoMorrer).toHaveBeenCalledOnce();
  });

  it("trata a morte no meio do envio como morte, não como erro solto", async () => {
    const api = viva();
    api.runtime.sendMessage.mockRejectedValue(new Error("Extension context invalidated"));
    const aoMorrer = vi.fn();
    const enviar = criarMensageiro(api, aoMorrer);

    await expect(enviar({ tipo: "x" })).resolves.toBeNull();
    expect(aoMorrer).toHaveBeenCalledOnce();
  });

  it("avisa da morte uma vez só, por mais que se tente", async () => {
    const api = morta();
    const aoMorrer = vi.fn();
    const enviar = criarMensageiro(api, aoMorrer);

    await enviar({ tipo: "a" });
    await enviar({ tipo: "b" });
    await enviar({ tipo: "c" });

    expect(aoMorrer).toHaveBeenCalledOnce();
  });

  it("um erro comum não é confundido com morte da extensão", async () => {
    const api = viva();
    api.runtime.sendMessage.mockRejectedValue(new Error("Receiving end does not exist"));
    const aoMorrer = vi.fn();
    const enviar = criarMensageiro(api, aoMorrer);

    expect(await enviar({ tipo: "x" })).toBeNull();
    expect(aoMorrer).not.toHaveBeenCalled();
  });
});
