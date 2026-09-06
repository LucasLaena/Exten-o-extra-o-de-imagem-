import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { observarNavegacao, INTERVALO_SONDAGEM_MS } from "../../src/content/app.js";

let cancelar;

beforeEach(() => {
  history.replaceState({}, "", "/inicio/");
});

afterEach(() => {
  cancelar?.();
  cancelar = undefined;
  vi.useRealTimers();
});

describe("observarNavegacao", () => {
  it("avisa na montagem com a URL atual", () => {
    const aoMudar = vi.fn();
    cancelar = observarNavegacao(aoMudar);
    expect(aoMudar).toHaveBeenCalledWith(window.location.href);
  });

  it("percebe navegação do próprio app, feita no mundo principal", async () => {
    // O content script roda no mundo ISOLADO. Embrulhar history.pushState aqui
    // não intercepta a chamada que o app faz no mundo MAIN: são objetos
    // diferentes. Por isso a sondagem periódica é obrigatória, não um extra.
    vi.useFakeTimers();

    // Guardar a função ANTES de observar é o que simula o outro mundo: o app
    // do Instagram chama a original, que nunca passa pelo nosso embrulho.
    const trocarUrlPorFora = history.replaceState.bind(history);

    const aoMudar = vi.fn();
    cancelar = observarNavegacao(aoMudar);
    aoMudar.mockClear();

    trocarUrlPorFora({}, "", "/outro-perfil/");
    expect(aoMudar).not.toHaveBeenCalled(); // o embrulho realmente não viu

    await vi.advanceTimersByTimeAsync(INTERVALO_SONDAGEM_MS + 10);
    expect(aoMudar).toHaveBeenCalledWith(expect.stringContaining("/outro-perfil/"));
  });

  it("avisa no botão voltar", () => {
    const aoMudar = vi.fn();
    cancelar = observarNavegacao(aoMudar);
    aoMudar.mockClear();
    history.replaceState({}, "", "/depois-do-voltar/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(aoMudar).toHaveBeenCalled();
  });

  it("não avisa duas vezes para a mesma URL", async () => {
    vi.useFakeTimers();
    const aoMudar = vi.fn();
    cancelar = observarNavegacao(aoMudar);
    aoMudar.mockClear();

    history.replaceState({}, "", "/mesmo/");
    await vi.advanceTimersByTimeAsync(INTERVALO_SONDAGEM_MS * 3);

    expect(aoMudar).toHaveBeenCalledTimes(1);
  });

  it("para de sondar ao cancelar", async () => {
    vi.useFakeTimers();
    const aoMudar = vi.fn();
    const parar = observarNavegacao(aoMudar);
    parar();
    aoMudar.mockClear();

    history.replaceState({}, "", "/depois-de-cancelar/");
    await vi.advanceTimersByTimeAsync(INTERVALO_SONDAGEM_MS * 3);

    expect(aoMudar).not.toHaveBeenCalled();
  });

  it("devolve o history original ao cancelar", () => {
    const antes = history.pushState;
    const parar = observarNavegacao(vi.fn());
    parar();
    expect(history.pushState).toBe(antes);
  });
});
