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
  const buscar = vi.fn(async (url) => ({
    ok: true,
    status: 200,
    text: async () =>
      url.includes("/api/v1/feed/")
        ? JSON.stringify({ items: [{ pk: "1" }], more_available: true })
        : "x".repeat(600) + JSON.stringify({ id: "1", username: "fulano" }),
  }));
  return { executor, repo, buscar };
}

const estadoDe = (passos, nome) => passos.find((p) => p.nome === nome)?.estado;

describe("caminho feliz", () => {
  it("passa em todos os elos", async () => {
    const { executor, repo, buscar } = ambiente(
      {
        pingar: "ok",
        capturaInstalada: true,
        sondarInstagram: { ok: true, status: 200, userId: "123", total: 42 },
      },
      { totalIndexado: 42, completo: true },
    );

    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar });

    expect(passos.every((p) => p.estado === "ok")).toBe(true);
    expect(passos.map((p) => p.nome)).toEqual([
      "Perfil informado",
      "Busca sem aba",
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
    const { executor, repo, buscar } = ambiente();
    const passos = await rodarDiagnostico({
      executor, alvo: resolverAlvo("https://youtube.com/@x"), repo, buscar,
    });
    expect(passos).toHaveLength(1);
    expect(passos[0].estado).toBe("erro");
    expect(passos[0].detalhe).toMatch(/instagram|tiktok/i);
  });

  it("aba que não abre interrompe o resto", async () => {
    const { executor, repo, buscar } = ambiente();
    executor.acharOuAbrirAba.mockRejectedValue(new Error("não terminou de carregar"));
    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar });
    expect(estadoDe(passos, "Aba do perfil")).toBe("erro");
    // Perfil informado, busca sem aba, e a aba que falhou.
    expect(passos).toHaveLength(3);
  });

  it("injeção bloqueada é dita com todas as letras", async () => {
    const { executor, repo, buscar } = ambiente({ pingar: new Error("Cannot access contents") });
    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar });
    expect(estadoDe(passos, "Executar código na aba")).toBe("erro");
  });

  it("captura ausente vira instrução de recarregar", async () => {
    const { executor, repo, buscar } = ambiente({
      pingar: "ok", capturaInstalada: false,
      sondarInstagram: { ok: true, status: 200, userId: "1" },
    });
    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar });
    const passo = passos.find((p) => p.nome === "Script de captura ativo");
    expect(passo.estado).toBe("erro");
    expect(passo.detalhe).toMatch(/F5/);
  });

  it("perfil não encontrado explica o status", async () => {
    const { executor, repo, buscar } = ambiente({
      pingar: "ok", capturaInstalada: true,
      sondarInstagram: { ok: false, status: 401 },
    });
    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar });
    const passo = passos.find((p) => p.nome === "Perfil encontrado no Instagram");
    expect(passo.estado).toBe("erro");
    expect(passo.detalhe).toContain("401");
  });

  it("perfil privado é aviso, não erro", async () => {
    const { executor, repo, buscar } = ambiente({
      pingar: "ok", capturaInstalada: true,
      sondarInstagram: { ok: true, status: 200, userId: "1", privado: true },
    });
    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar });
    expect(estadoDe(passos, "Perfil encontrado no Instagram")).toBe("aviso");
  });
});

describe("busca sem aba", () => {
  it("aprova quando o feed responde: aí nem precisa de aba", async () => {
    const { executor, repo, buscar } = ambiente({ pingar: "ok", capturaInstalada: true });
    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar });
    const passo = passos.find((p) => p.nome === "Busca sem aba");
    expect(passo.estado).toBe("ok");
    expect(passo.detalhe).toMatch(/não precisa de aba/i);
  });

  it("diz o status quando o feed recusa, em vez de só falhar", async () => {
    const { executor, repo } = ambiente({ pingar: "ok", capturaInstalada: true });
    const buscar = vi.fn(async (url) =>
      url.includes("/api/v1/feed/")
        ? { ok: false, status: 401, text: async () => "login_required" }
        : {
            ok: true,
            status: 200,
            text: async () => "x".repeat(600) + JSON.stringify({ id: "1", username: "fulano" }),
          },
    );

    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar });
    const passo = passos.find((p) => p.nome === "Busca sem aba");
    expect(passo.estado).toBe("aviso");
    expect(passo.detalhe).toContain("401");
    expect(passo.detalhe).toContain("login_required");
  });

  it("avisa quando a página vem sem identificador, que é a versão deslogada", async () => {
    const { executor, repo } = ambiente({ pingar: "ok", capturaInstalada: true });
    const buscar = vi.fn(async () => ({
      ok: true, status: 200, text: async () => "y".repeat(900),
    }));

    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar });
    const passo = passos.find((p) => p.nome === "Busca sem aba");
    expect(passo.estado).toBe("aviso");
    expect(passo.detalhe).toMatch(/deslogada/i);
  });

  it("perfil privado é erro, e não adianta abrir aba", async () => {
    const { executor, repo } = ambiente({ pingar: "ok", capturaInstalada: true });
    const buscar = vi.fn(async () => ({
      ok: true, status: 200, text: async () => "x".repeat(600) + JSON.stringify({ is_private: true }),
    }));

    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar });
    expect(estadoDe(passos, "Busca sem aba")).toBe("erro");
  });

  it("no TikTok nem tenta: o caminho lá é outro", async () => {
    const { executor, repo, buscar } = ambiente({ pingar: "ok", capturaInstalada: true });
    const passos = await rodarDiagnostico({ executor, alvo: alvoTT, repo, buscar });
    expect(passos.some((p) => p.nome === "Busca sem aba")).toBe(false);
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe("TikTok", () => {
  it("explica a estratégia em vez de sondar a API", async () => {
    const { executor, repo, buscar } = ambiente({ pingar: "ok", capturaInstalada: true });
    const passos = await rodarDiagnostico({ executor, alvo: alvoTT, repo, buscar });
    expect(estadoDe(passos, "Coleta do TikTok")).toBe("aviso");
    expect(executor.rodar).not.toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ name: "sondarInstagram" }), expect.anything());
  });
});

describe("higiene", () => {
  it("sempre fecha a aba que ele mesmo abriu", async () => {
    const { executor, repo, buscar } = ambiente({ pingar: new Error("falhou") });
    executor.acharOuAbrirAba.mockResolvedValue({ abaId: 9, criada: true });
    await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar });
    expect(executor.fecharSeCriada).toHaveBeenCalledWith({ abaId: 9, criada: true });
  });
});
