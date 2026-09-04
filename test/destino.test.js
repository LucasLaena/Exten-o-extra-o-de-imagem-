import { describe, it, expect, vi } from "vitest";
import { reautorizar } from "../src/acervo/destino.js";

const pasta = ({ consulta = "granted", pedido = "granted", lancaAoPedir = false } = {}) => ({
  queryPermission: vi.fn().mockResolvedValue(consulta),
  requestPermission: lancaAoPedir
    ? vi.fn().mockRejectedValue(new Error("User activation is required"))
    : vi.fn().mockResolvedValue(pedido),
});

describe("reautorizar", () => {
  it("aceita quando a permissão já está concedida, sem pedir nada", async () => {
    const p = pasta({ consulta: "granted" });
    expect(await reautorizar(p, { pedir: false })).toBe(true);
    expect(p.requestPermission).not.toHaveBeenCalled();
  });

  it("não pede permissão quando pedir é false", async () => {
    // requestPermission exige gesto do usuário: chamá-lo na carga da página
    // lança e derruba a inicialização inteira.
    const p = pasta({ consulta: "prompt" });
    expect(await reautorizar(p, { pedir: false })).toBe(false);
    expect(p.requestPermission).not.toHaveBeenCalled();
  });

  it("pede permissão quando autorizado a pedir", async () => {
    const p = pasta({ consulta: "prompt", pedido: "granted" });
    expect(await reautorizar(p, { pedir: true })).toBe(true);
    expect(p.requestPermission).toHaveBeenCalledOnce();
  });

  it("respeita a recusa", async () => {
    const p = pasta({ consulta: "prompt", pedido: "denied" });
    expect(await reautorizar(p, { pedir: true })).toBe(false);
  });

  it("engole a exceção de gesto ausente em vez de derrubar a página", async () => {
    const p = pasta({ consulta: "prompt", lancaAoPedir: true });
    await expect(reautorizar(p, { pedir: true })).resolves.toBe(false);
  });

  it("aceita handle ausente ou sem a API", async () => {
    expect(await reautorizar(null)).toBe(false);
    expect(await reautorizar({})).toBe(false);
  });

  it("por padrão não pede, que é o caso da carga da página", async () => {
    const p = pasta({ consulta: "prompt" });
    expect(await reautorizar(p)).toBe(false);
    expect(p.requestPermission).not.toHaveBeenCalled();
  });
});
