import { describe, it, expect, vi } from "vitest";
import { rodarDiagnostico } from "../src/acervo/diagnostico.js";
import { resolverAlvo } from "../src/acervo/alvo.js";

const alvoIG = resolverAlvo("https://www.instagram.com/fulano/");
const alvoTT = resolverAlvo("https://www.tiktok.com/@fulano");

function ambiente(respostas = {}, perfilSalvo = null) {
  const executor = {
    acharOuAbrirAba: vi.fn().mockResolvedValue({ abaId: 9, criada: false }),
    fecharSeCriada: vi.fn().mockResolvedValue(undefined),
    rodar: vi.fn(async (_aba, func) => {
      const r = respostas[func.name];
      if (r instanceof Error) throw r;
      return r;
    }),
  };
  const repo = { perfis: { obter: vi.fn().mockResolvedValue(perfilSalvo) } };
  return { executor, repo };
}

const estadoDe = (passos, nome) => passos.find((p) => p.nome === nome)?.estado;

describe("caminho feliz", () => {
  it("passa em todos os elos", async () => {
    const { executor, repo } = ambiente(
      {
        pingar: "ok",
        capturaInstalada: true,
        sondarInstagram: { ok: true, status: 200, userId: "123", total: 42 },
      },
      { totalIndexado: 42, completo: true },
    );

    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo });

    expect(passos.every((p) => p.estado === "ok")).toBe(true);
    expect(passos.map((p) => p.nome)).toEqual([
      "Perfil informado",
      "Aba do perfil",
      "Executar código na aba",
      "Script de captura ativo",
      "Perfil encontrado no Instagram",
      "Catálogo salvo",
    ]);
  });
});

describe("cada elo quebrado é apontado", () => {
  it("perfil inválido para tudo logo no começo", async () => {
    const { executor, repo } = ambiente();
    const passos = await rodarDiagnostico({
      executor, alvo: resolverAlvo("https://youtube.com/@x"), repo,
    });
    expect(passos).toHaveLength(1);
    expect(passos[0].estado).toBe("erro");
    expect(passos[0].detalhe).toMatch(/instagram|tiktok/i);
  });

  it("aba que não abre interrompe o resto", async () => {
    const { executor, repo } = ambiente();
    executor.acharOuAbrirAba.mockRejectedValue(new Error("não terminou de carregar"));
    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo });
    expect(estadoDe(passos, "Aba do perfil")).toBe("erro");
    expect(passos).toHaveLength(2);
  });

  it("injeção bloqueada é dita com todas as letras", async () => {
    const { executor, repo } = ambiente({ pingar: new Error("Cannot access contents") });
    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo });
    expect(estadoDe(passos, "Executar código na aba")).toBe("erro");
  });

  it("captura ausente vira instrução de recarregar", async () => {
    const { executor, repo } = ambiente({
      pingar: "ok", capturaInstalada: false,
      sondarInstagram: { ok: true, status: 200, userId: "1" },
    });
    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo });
    const passo = passos.find((p) => p.nome === "Script de captura ativo");
    expect(passo.estado).toBe("erro");
    expect(passo.detalhe).toMatch(/F5/);
  });

  it("perfil não encontrado explica o status", async () => {
    const { executor, repo } = ambiente({
      pingar: "ok", capturaInstalada: true,
      sondarInstagram: { ok: false, status: 401 },
    });
    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo });
    const passo = passos.find((p) => p.nome === "Perfil encontrado no Instagram");
    expect(passo.estado).toBe("erro");
    expect(passo.detalhe).toContain("401");
  });

  it("perfil privado é aviso, não erro", async () => {
    const { executor, repo } = ambiente({
      pingar: "ok", capturaInstalada: true,
      sondarInstagram: { ok: true, status: 200, userId: "1", privado: true },
    });
    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo });
    expect(estadoDe(passos, "Perfil encontrado no Instagram")).toBe("aviso");
  });
});

describe("TikTok", () => {
  it("explica a estratégia em vez de sondar a API", async () => {
    const { executor, repo } = ambiente({ pingar: "ok", capturaInstalada: true });
    const passos = await rodarDiagnostico({ executor, alvo: alvoTT, repo });
    expect(estadoDe(passos, "Coleta do TikTok")).toBe("aviso");
    expect(executor.rodar).not.toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ name: "sondarInstagram" }), expect.anything());
  });
});

describe("higiene", () => {
  it("sempre fecha a aba que ele mesmo abriu", async () => {
    const { executor, repo } = ambiente({ pingar: new Error("falhou") });
    executor.acharOuAbrirAba.mockResolvedValue({ abaId: 9, criada: true });
    await rodarDiagnostico({ executor, alvo: alvoIG, repo });
    expect(executor.fecharSeCriada).toHaveBeenCalledWith({ abaId: 9, criada: true });
  });
});
