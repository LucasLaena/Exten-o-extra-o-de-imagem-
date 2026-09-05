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

const ASSINATURA = {
  url: "https://www.instagram.com/graphql/query",
  ondeVaiOCursor: "form",
};

/** Canal e aprendiz de mentira: a etapa da consulta nao pode depender de rede. */
function falsos(sobrescrever = {}) {
  return {
    abrir: vi.fn(async () => ({
      drenar: vi.fn(async () => []),
      fechar: vi.fn(async () => {}),
    })),
    aprendiz: () => ({
      aprender: vi.fn(async () => ({
        assinatura: ASSINATURA,
        pagina: { itens: [{ id: "a" }, { id: "b" }] },
      })),
    }),
    ...sobrescrever,
  };
}

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

    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar, ...falsos() });

    expect(passos.every((p) => p.estado === "ok")).toBe(true);
    expect(passos.map((p) => p.nome)).toEqual([
      "Perfil informado",
      "Leitura do perfil",
      "Aba do perfil",
      "Executar código na aba",
      "Script de captura ativo",
      "Perfil encontrado no Instagram",
      "Consulta do feed",
      "Catálogo salvo",
    ]);
  });
});

describe("cada elo quebrado é apontado", () => {
  it("perfil inválido para tudo logo no começo", async () => {
    const { executor, repo, buscar } = ambiente();
    const passos = await rodarDiagnostico({
      executor, alvo: resolverAlvo("https://youtube.com/@x"), repo, buscar, ...falsos(),
    });
    expect(passos).toHaveLength(1);
    expect(passos[0].estado).toBe("erro");
    expect(passos[0].detalhe).toMatch(/instagram|tiktok/i);
  });

  it("aba que não abre interrompe o resto", async () => {
    const { executor, repo, buscar } = ambiente();
    executor.acharOuAbrirAba.mockRejectedValue(new Error("não terminou de carregar"));
    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar, ...falsos() });
    expect(estadoDe(passos, "Aba do perfil")).toBe("erro");
    // Perfil informado, leitura do perfil, e a aba que falhou.
    expect(passos).toHaveLength(3);
  });

  it("injeção bloqueada é dita com todas as letras", async () => {
    const { executor, repo, buscar } = ambiente({ pingar: new Error("Cannot access contents") });
    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar, ...falsos() });
    expect(estadoDe(passos, "Executar código na aba")).toBe("erro");
  });

  it("captura ausente vira instrução de recarregar", async () => {
    const { executor, repo, buscar } = ambiente({
      pingar: "ok", capturaInstalada: false,
      sondarInstagram: { ok: true, status: 200, userId: "1" },
    });
    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar, ...falsos() });
    const passo = passos.find((p) => p.nome === "Script de captura ativo");
    expect(passo.estado).toBe("erro");
    expect(passo.detalhe).toMatch(/F5/);
  });

  it("perfil não encontrado explica o status", async () => {
    const { executor, repo, buscar } = ambiente({
      pingar: "ok", capturaInstalada: true,
      sondarInstagram: { ok: false, status: 401 },
    });
    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar, ...falsos() });
    const passo = passos.find((p) => p.nome === "Perfil encontrado no Instagram");
    expect(passo.estado).toBe("erro");
    expect(passo.detalhe).toContain("401");
  });

  it("perfil privado é aviso, não erro", async () => {
    const { executor, repo, buscar } = ambiente({
      pingar: "ok", capturaInstalada: true,
      sondarInstagram: { ok: true, status: 200, userId: "1", privado: true },
    });
    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar, ...falsos() });
    expect(estadoDe(passos, "Perfil encontrado no Instagram")).toBe("aviso");
  });
});

describe("leitura do perfil sem aba", () => {
  it("aprova quando a página entrega o identificador", async () => {
    const { executor, repo, buscar } = ambiente({ pingar: "ok", capturaInstalada: true });
    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar, ...falsos() });
    const passo = passos.find((p) => p.nome === "Leitura do perfil");
    expect(passo.estado).toBe("ok");
    expect(passo.detalhe).toMatch(/sem aba nenhuma/i);
  });

  it("não sonda /api/v1: esse endpoint devolve a página do site, não dados", async () => {
    // Testá-lo daria "aviso" em todo perfil e mandaria o diagnóstico apontar
    // uma causa que não é a causa. A coleta aprende a consulta pela aba.
    const { executor, repo, buscar } = ambiente({ pingar: "ok", capturaInstalada: true });
    await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar, ...falsos() });
    expect(buscar.mock.calls.some(([url]) => url.includes("/api/v1/feed/"))).toBe(false);
  });

  it("limite de consulta é erro com instrução de esperar", async () => {
    const { executor, repo } = ambiente({ pingar: "ok", capturaInstalada: true });
    const buscar = vi.fn(async () => ({ ok: false, status: 429, text: async () => "" }));

    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar, ...falsos() });
    const passo = passos.find((p) => p.nome === "Leitura do perfil");
    expect(passo.estado).toBe("erro");
    expect(passo.detalhe).toContain("429");
    expect(passo.detalhe).toMatch(/espere/i);
  });

  it("avisa quando a página vem sem identificador, que é a versão deslogada", async () => {
    const { executor, repo } = ambiente({ pingar: "ok", capturaInstalada: true });
    const buscar = vi.fn(async () => ({
      ok: true, status: 200, text: async () => "y".repeat(900),
    }));

    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar, ...falsos() });
    const passo = passos.find((p) => p.nome === "Leitura do perfil");
    expect(passo.estado).toBe("aviso");
    expect(passo.detalhe).toMatch(/deslogada/i);
  });

  it("perfil privado é erro, e não adianta abrir aba", async () => {
    const { executor, repo } = ambiente({ pingar: "ok", capturaInstalada: true });
    const buscar = vi.fn(async () => ({
      ok: true, status: 200, text: async () => "x".repeat(600) + JSON.stringify({ is_private: true }),
    }));

    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar, ...falsos() });
    expect(estadoDe(passos, "Leitura do perfil")).toBe("erro");
  });

  it("no TikTok nem tenta: o caminho lá é outro", async () => {
    const { executor, repo, buscar } = ambiente({ pingar: "ok", capturaInstalada: true });
    const passos = await rodarDiagnostico({ executor, alvo: alvoTT, repo, buscar, ...falsos() });
    expect(passos.some((p) => p.nome === "Leitura do perfil")).toBe(false);
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe("TikTok", () => {
  it("explica a estratégia em vez de sondar a API", async () => {
    const { executor, repo, buscar } = ambiente({ pingar: "ok", capturaInstalada: true });
    const passos = await rodarDiagnostico({ executor, alvo: alvoTT, repo, buscar, ...falsos() });
    expect(estadoDe(passos, "Coleta do TikTok")).toBe("aviso");
    expect(executor.rodar).not.toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ name: "sondarInstagram" }), expect.anything());
  });
});

describe("higiene", () => {
  it("sempre fecha a aba que ele mesmo abriu", async () => {
    const { executor, repo, buscar } = ambiente({ pingar: new Error("falhou") });
    executor.acharOuAbrirAba.mockResolvedValue({ abaId: 9, criada: true });
    await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar, ...falsos() });
    expect(executor.fecharSeCriada).toHaveBeenCalledWith({ abaId: 9, criada: true });
  });
});

describe("consulta do feed", () => {
  // Esta etapa existe porque o diagnostico dava tudo verde e a indexacao
  // morria logo depois: aprender a consulta era o unico elo sem teste, e e
  // justamente o que quebra quando o Instagram muda de formato.
  it("diz onde a consulta foi aprendida e quanto veio nela", async () => {
    const { executor, repo, buscar } = ambiente({ pingar: "ok", capturaInstalada: true });
    const passos = await rodarDiagnostico({ executor, alvo: alvoIG, repo, buscar, ...falsos() });

    const passo = passos.find((p) => p.nome === "Consulta do feed");
    expect(passo.estado).toBe("ok");
    expect(passo.detalhe).toContain("/graphql/query");
    expect(passo.detalhe).toContain("2 publicações");
  });

  it("repassa o motivo quando nao consegue aprender", async () => {
    const { executor, repo, buscar } = ambiente({ pingar: "ok", capturaInstalada: true });
    const passos = await rodarDiagnostico({
      executor, alvo: alvoIG, repo, buscar,
      ...falsos({
        aprendiz: () => ({
          aprender: async () => {
            throw new Error("Vi 3 consulta(s) do feed, mas sem o doc_id");
          },
        }),
      }),
    });

    const passo = passos.find((p) => p.nome === "Consulta do feed");
    expect(passo.estado).toBe("erro");
    expect(passo.detalhe).toContain("doc_id");
  });

  it("fecha a aba do canal mesmo quando a etapa falha", async () => {
    const { executor, repo, buscar } = ambiente({ pingar: "ok", capturaInstalada: true });
    const fechar = vi.fn(async () => {});
    await rodarDiagnostico({
      executor, alvo: alvoIG, repo, buscar,
      ...falsos({
        abrir: async () => ({ drenar: async () => [], fechar }),
        aprendiz: () => ({ aprender: async () => { throw new Error("nada"); } }),
      }),
    });

    expect(fechar).toHaveBeenCalled();
  });

  it("no TikTok nao tenta: la nao ha consulta para aprender", async () => {
    const { executor, repo, buscar } = ambiente({ pingar: "ok", capturaInstalada: true });
    const passos = await rodarDiagnostico({ executor, alvo: alvoTT, repo, buscar, ...falsos() });
    expect(passos.some((p) => p.nome === "Consulta do feed")).toBe(false);
  });
});
