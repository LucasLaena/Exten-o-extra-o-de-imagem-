import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ID_MODAL, estadoInicial, podeOrdenarPorRelevancia, abrirModal, fecharModal,
} from "../../src/content/modal.js";
import { instagram } from "../../src/adapters/instagram.js";

const catalogo = (p = {}) => ({ totalIndexado: 3000, completo: true, ...p });

const abrir = (sobrescrever = {}) =>
  abrirModal({
    adaptador: instagram,
    handle: "fulano",
    profileKey: "ig:@fulano",
    carregarCatalogo: async () => catalogo(),
    aoConfirmar: vi.fn(),
    aoIndexar: vi.fn(),
    aoAbrirAcervo: vi.fn(),
    ...sobrescrever,
  });

const raiz = () => document.getElementById(ID_MODAL)?.shadowRoot;
const $ = (sel) => raiz().querySelector(sel);
const $$ = (sel) => [...raiz().querySelectorAll(sel)];

const escolherCaminho = (valor) => {
  const opcao = $$('[name="caminho"]').find((e) => e.value === valor);
  opcao.checked = true;
  opcao.dispatchEvent(new Event("change", { bubbles: true }));
};

beforeEach(() => {
  fecharModal();
  document.body.innerHTML = "";
  document.documentElement.innerHTML = "<head></head><body></body>";
});

describe("estadoInicial", () => {
  it("começa com os padrões da spec", () => {
    expect(estadoInicial()).toEqual({
      filtro: "ambos", incluirCapaReel: false, modo: "faixa",
      de: 1, ate: 100, ordenacao: "sequencia", pularBaixados: true,
    });
  });
});

describe("podeOrdenarPorRelevancia", () => {
  it("exige catálogo completo e não vazio", () => {
    expect(podeOrdenarPorRelevancia(catalogo({ completo: true }))).toBe(true);
    expect(podeOrdenarPorRelevancia(catalogo({ completo: false }))).toBe(false);
    expect(podeOrdenarPorRelevancia({ totalIndexado: 0, completo: true })).toBe(false);
    expect(podeOrdenarPorRelevancia(null)).toBe(false);
  });
});

describe("os dois caminhos", () => {
  it("oferece faixa e filtros, com a faixa marcada por padrão", async () => {
    await abrir();
    expect($$('[name="caminho"]').map((e) => e.value)).toEqual(["faixa", "filtros"]);
    expect($$('[name="caminho"]').find((e) => e.value === "faixa").checked).toBe(true);
  });

  it("mostra os campos de faixa e esconde os filtros no caminho da faixa", async () => {
    await abrir();
    expect($(".secao-faixa").hidden).toBe(false);
    expect($(".secao-filtros").hidden).toBe(true);
  });

  it("troca as seções ao escolher filtros", async () => {
    await abrir();
    escolherCaminho("filtros");
    expect($(".secao-faixa").hidden).toBe(true);
    expect($(".secao-filtros").hidden).toBe(false);
  });
});

describe("custo de cada caminho", () => {
  it("diz quantas a faixa vai buscar, e que é rápido", async () => {
    await abrir();
    expect($(".caminho-custo").textContent).toMatch(/buscar 100/);
    expect($(".caminho-custo").textContent).toMatch(/segundos/);
  });

  it("recalcula o custo ao mexer na faixa", async () => {
    await abrir();
    const ate = $('[name="ate"]');
    ate.value = "500";
    ate.dispatchEvent(new Event("input", { bubbles: true }));
    expect($(".caminho-custo").textContent).toMatch(/buscar 500/);
  });

  it("diz o custo de catalogar quando a página informa o total", async () => {
    document.documentElement.innerHTML =
      '<head></head><body>{"edge_owner_to_timeline_media":{"count":2000}}</body>';
    await abrir({ carregarCatalogo: async () => catalogo({ completo: false, totalIndexado: 0 }) });
    const custos = $$(".caminho-custo").map((e) => e.textContent);
    expect(custos[1]).toMatch(/catalogar 2\.000/);
    expect(custos[1]).toMatch(/min|s\b/);
  });

  it("diz que já está pronto quando o perfil foi catalogado antes", async () => {
    await abrir({ carregarCatalogo: async () => catalogo({ completo: true, totalIndexado: 3000 }) });
    const custos = $$(".caminho-custo").map((e) => e.textContent);
    expect(custos[1]).toMatch(/já catalogadas/i);
    expect($$(".caminho-custo")[1].dataset.bom).toBe("1");
  });

  it("marca o custo de catalogar como caro quando ainda não foi feito", async () => {
    await abrir({ carregarCatalogo: async () => catalogo({ completo: false, totalIndexado: 0 }) });
    expect($$(".caminho-custo")[1].dataset.bom).toBe("0");
  });
});

describe("o que o botão faz", () => {
  it("no caminho da faixa, pede para baixar direto, sem catalogar tudo", async () => {
    const aoConfirmar = vi.fn();
    const aoIndexar = vi.fn();
    await abrir({ aoConfirmar, aoIndexar });

    $(".confirmar").click();

    expect(aoIndexar).not.toHaveBeenCalled();
    expect(aoConfirmar).toHaveBeenCalledWith(expect.objectContaining({
      caminho: "faixa",
      escopo: "faixa",
      ordenacao: "sequencia",
      modo: "faixa",
      de: 1,
      ate: 100,
      profileKey: "ig:@fulano",
    }));
  });

  it("no caminho dos filtros, manda catalogar o perfil inteiro", async () => {
    const aoConfirmar = vi.fn();
    const aoIndexar = vi.fn();
    await abrir({ aoConfirmar, aoIndexar });

    escolherCaminho("filtros");
    const ordenacao = $('[name="ordenacao"]');
    ordenacao.value = "views";
    ordenacao.dispatchEvent(new Event("change", { bubbles: true }));

    $(".confirmar").click();

    expect(aoConfirmar).not.toHaveBeenCalled();
    expect(aoIndexar).toHaveBeenCalledWith(expect.objectContaining({
      caminho: "filtros",
      escopo: "tudo",
      ordenacao: "views",
    }));
  });

  it("o rótulo do botão diz o que vai acontecer em cada caminho", async () => {
    await abrir({ carregarCatalogo: async () => catalogo({ completo: false, totalIndexado: 0 }) });
    expect($(".confirmar").textContent).toBe("Baixar publicações 1–100");

    escolherCaminho("filtros");
    expect($(".confirmar").textContent).toMatch(/catalogar/i);
  });

  it("com o perfil já catalogado, filtros só abre o Acervo", async () => {
    await abrir();
    escolherCaminho("filtros");
    expect($(".confirmar").textContent).toMatch(/abrir o acervo/i);
  });

  it("leva o tipo de mídia junto nos dois caminhos", async () => {
    const aoConfirmar = vi.fn();
    await abrir({ aoConfirmar });

    const soVideos = $$('[name="filtro"]').find((e) => e.value === "videos");
    soVideos.checked = true;
    soVideos.dispatchEvent(new Event("change", { bubbles: true }));

    $(".confirmar").click();
    expect(aoConfirmar).toHaveBeenCalledWith(expect.objectContaining({ filtro: "videos" }));
  });

  it("fecha depois de confirmar, em vez de ficar no caminho", async () => {
    await abrir();
    $(".confirmar").click();
    expect(document.getElementById(ID_MODAL)).toBeNull();
  });
});

describe("a régua", () => {
  it("mostra a janela dentro do total do perfil", async () => {
    document.documentElement.innerHTML =
      '<head></head><body>{"edge_owner_to_timeline_media":{"count":1000}}</body>';
    await abrir();

    const de = $('[name="de"]');
    const ate = $('[name="ate"]');
    de.value = "500"; de.dispatchEvent(new Event("input", { bubbles: true }));
    ate.value = "1000"; ate.dispatchEvent(new Event("input", { bubbles: true }));

    const banda = $(".regua-banda");
    expect(parseFloat(banda.style.left)).toBeCloseTo(49.9, 0);
    expect(parseFloat(banda.style.width)).toBeCloseTo(50.1, 0);
  });
});

describe("resiliência e fechamento", () => {
  it("abre mesmo quando a consulta do catálogo falha", async () => {
    await abrir({ carregarCatalogo: async () => { throw new Error("mudo"); } });
    expect(raiz()).toBeTruthy();
    expect($(".confirmar")).toBeTruthy();
  });

  it("abre mesmo quando a consulta nunca resolve", async () => {
    await abrir({ carregarCatalogo: () => new Promise(() => {}), tempoLimiteCatalogo: 20 });
    expect(raiz()).toBeTruthy();
  });

  it("fecha no X e no Esc", async () => {
    await abrir();
    $(".fechar").click();
    expect(document.getElementById(ID_MODAL)).toBeNull();

    await abrir();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.getElementById(ID_MODAL)).toBeNull();
  });

  it("não abre dois modais empilhados", async () => {
    await abrir();
    await abrir();
    expect(document.querySelectorAll(`#${ID_MODAL}`)).toHaveLength(1);
  });

  it("abre o Acervo completo pelo link", async () => {
    const aoAbrirAcervo = vi.fn();
    await abrir({ aoAbrirAcervo });
    $(".abrir-acervo").click();
    expect(aoAbrirAcervo).toHaveBeenCalledOnce();
  });

  it("escreve tudo em português", async () => {
    await abrir();
    const texto = raiz().textContent.toLowerCase();
    expect(texto).not.toMatch(/\bdownload\b|\brange\b|\bmedia type\b/);
  });
});
