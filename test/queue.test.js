import { describe, it, expect, vi } from "vitest";
import {
  ErroBloqueio,
  ehStatusDeBloqueio,
  dormir,
  esperaAleatoria,
  comRetentativa,
  pipelineOrdenado,
} from "../src/core/queue.js";

const coletar = async (gerador) => {
  const saida = [];
  for await (const r of gerador) saida.push(r);
  return saida;
};

describe("ehStatusDeBloqueio", () => {
  it("reconhece os três status que a spec manda tratar como bloqueio", () => {
    expect(ehStatusDeBloqueio(429)).toBe(true);
    expect(ehStatusDeBloqueio(401)).toBe(true);
    expect(ehStatusDeBloqueio(403)).toBe(true);
  });

  it("não confunde erro comum com bloqueio", () => {
    expect(ehStatusDeBloqueio(404)).toBe(false);
    expect(ehStatusDeBloqueio(500)).toBe(false);
    expect(ehStatusDeBloqueio(200)).toBe(false);
  });
});

describe("esperaAleatoria", () => {
  it("fica dentro da janela pedida", () => {
    for (let i = 0; i < 200; i++) {
      const ms = esperaAleatoria(800, 2000);
      expect(ms).toBeGreaterThanOrEqual(800);
      expect(ms).toBeLessThanOrEqual(2000);
    }
  });

  it("aceita gerador injetado, para o teste ser determinístico", () => {
    expect(esperaAleatoria(800, 2000, () => 0)).toBe(800);
    expect(esperaAleatoria(800, 2000, () => 0.5)).toBe(1400);
  });
});

describe("dormir", () => {
  it("resolve depois do tempo", async () => {
    vi.useFakeTimers();
    let terminou = false;
    const p = dormir(1000).then(() => (terminou = true));
    await vi.advanceTimersByTimeAsync(999);
    expect(terminou).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(terminou).toBe(true);
    vi.useRealTimers();
  });

  it("rejeita na hora se o sinal já veio abortado", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(dormir(10_000, ctrl.signal)).rejects.toThrow(/cancelado/i);
  });

  it("rejeita quando o sinal aborta no meio da espera", async () => {
    const ctrl = new AbortController();
    const p = dormir(10_000, ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toThrow(/cancelado/i);
  });
});

describe("comRetentativa", () => {
  it("não repete quando dá certo de primeira", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    expect(await comRetentativa(fn, { baseMs: 1 })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("tenta três vezes por padrão e devolve o sucesso", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("rede"))
      .mockRejectedValueOnce(new Error("rede"))
      .mockResolvedValue("ok");
    expect(await comRetentativa(fn, { baseMs: 1 })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("propaga o último erro quando esgota as tentativas", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("morreu"));
    await expect(comRetentativa(fn, { tentativas: 3, baseMs: 1 })).rejects.toThrow("morreu");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("cresce a espera exponencialmente entre tentativas", async () => {
    const esperas = [];
    const fn = vi.fn().mockRejectedValue(new Error("x"));
    await expect(
      comRetentativa(fn, {
        tentativas: 4,
        baseMs: 1,
        aoTentar: (n, ms) => esperas.push([n, ms]),
      }),
    ).rejects.toThrow();
    expect(esperas.map(([n]) => n)).toEqual([1, 2, 3]);
    expect(esperas.map(([, ms]) => ms)).toEqual([1, 2, 4]);
  });

  it("não insiste contra bloqueio da plataforma", async () => {
    const fn = vi.fn().mockRejectedValue(new ErroBloqueio(429));
    await expect(comRetentativa(fn, { tentativas: 5, baseMs: 1 })).rejects.toBeInstanceOf(
      ErroBloqueio,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("para de tentar quando o sinal aborta", async () => {
    const ctrl = new AbortController();
    const fn = vi.fn().mockImplementation(() => {
      ctrl.abort();
      return Promise.reject(new Error("x"));
    });
    await expect(
      comRetentativa(fn, { tentativas: 5, baseMs: 1, sinal: ctrl.signal }),
    ).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("pipelineOrdenado", () => {
  it("entrega na ordem de entrada mesmo terminando fora de ordem", async () => {
    const atrasos = [50, 10, 30, 0, 20];
    const r = await coletar(
      pipelineOrdenado(atrasos, async (ms, i) => {
        await new Promise((res) => setTimeout(res, ms));
        return i;
      }),
    );
    expect(r.map((x) => x.valor)).toEqual([0, 1, 2, 3, 4]);
    expect(r.map((x) => x.indice)).toEqual([0, 1, 2, 3, 4]);
  });

  it("respeita o limite de concorrência", async () => {
    let emVoo = 0;
    let pico = 0;
    await coletar(
      pipelineOrdenado(Array.from({ length: 30 }, (_, i) => i), async () => {
        pico = Math.max(pico, ++emVoo);
        await new Promise((res) => setTimeout(res, 5));
        emVoo--;
      }, { concorrencia: 4 }),
    );
    expect(pico).toBeLessThanOrEqual(4);
    expect(pico).toBe(4);
  });

  it("não corre muito à frente do consumidor", async () => {
    const iniciados = [];
    const gerador = pipelineOrdenado(
      Array.from({ length: 50 }, (_, i) => i),
      async (i) => { iniciados.push(i); return i; },
      { concorrencia: 2, buffer: 2 },
    );
    await gerador.next();
    // com concorrência 2 e buffer 2, no máximo 4 itens saem da largada
    expect(iniciados.length).toBeLessThanOrEqual(4);
    await gerador.return();
  });

  it("emite o erro do item em vez de derrubar o lote", async () => {
    const r = await coletar(
      pipelineOrdenado([1, 2, 3], async (n) => {
        if (n === 2) throw new Error("midia morta");
        return n * 10;
      }),
    );
    expect(r[0].valor).toBe(10);
    expect(r[1].erro.message).toBe("midia morta");
    expect(r[1].valor).toBeUndefined();
    expect(r[2].valor).toBe(30);
  });

  it("aceita lista vazia", async () => {
    expect(await coletar(pipelineOrdenado([], async () => 1))).toEqual([]);
  });

  it("passa o índice para o trabalhador", async () => {
    const r = await coletar(
      pipelineOrdenado(["a", "b"], async (item, i) => `${item}${i}`),
    );
    expect(r.map((x) => x.valor)).toEqual(["a0", "b1"]);
  });

  it("aborta quando o sinal manda", async () => {
    const ctrl = new AbortController();
    const gerador = pipelineOrdenado(
      Array.from({ length: 100 }, (_, i) => i),
      async (i) => { if (i === 3) ctrl.abort(); return i; },
      { concorrencia: 1, sinal: ctrl.signal },
    );
    await expect(coletar(gerador)).rejects.toThrow(/cancelado/i);
  });
});
