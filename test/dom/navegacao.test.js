import { describe, it, expect, vi, afterEach } from "vitest";
import { observarNavegacao } from "../../src/content/app.js";

let cancelar;
afterEach(() => { cancelar?.(); cancelar = undefined; });

describe("observarNavegacao", () => {
  it("avisa na montagem com a URL atual", () => {
    const aoMudar = vi.fn();
    cancelar = observarNavegacao(aoMudar);
    expect(aoMudar).toHaveBeenCalledWith(window.location.href);
  });

  it("avisa quando o app chama pushState", () => {
    const aoMudar = vi.fn();
    cancelar = observarNavegacao(aoMudar);
    aoMudar.mockClear();
    history.pushState({}, "", "/outro-perfil/");
    expect(aoMudar).toHaveBeenCalledWith(expect.stringContaining("/outro-perfil/"));
  });

  it("avisa quando o app chama replaceState", () => {
    const aoMudar = vi.fn();
    cancelar = observarNavegacao(aoMudar);
    aoMudar.mockClear();
    history.replaceState({}, "", "/trocado/");
    expect(aoMudar).toHaveBeenCalledWith(expect.stringContaining("/trocado/"));
  });

  it("avisa no botão voltar", () => {
    const aoMudar = vi.fn();
    history.replaceState({}, "", "/ponto-de-partida/");
    cancelar = observarNavegacao(aoMudar);
    aoMudar.mockClear();
    history.replaceState({}, "", "/depois-do-voltar/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(aoMudar).toHaveBeenCalled();
  });

  it("não avisa duas vezes para a mesma URL", () => {
    const aoMudar = vi.fn();
    cancelar = observarNavegacao(aoMudar);
    aoMudar.mockClear();
    history.pushState({}, "", "/mesmo/");
    history.pushState({}, "", "/mesmo/");
    expect(aoMudar).toHaveBeenCalledTimes(1);
  });

  it("devolve o history original ao cancelar", () => {
    const antes = history.pushState;
    const parar = observarNavegacao(vi.fn());
    expect(history.pushState).not.toBe(antes);
    parar();
    expect(history.pushState).toBe(antes);
  });
});
