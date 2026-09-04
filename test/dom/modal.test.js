import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ID_MODAL, estadoInicial, podeOrdenarPorRelevancia, rotuloDoBotao,
  abrirModal, fecharModal,
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

beforeEach(() => { fecharModal(); document.body.innerHTML = ""; });

describe("estadoInicial", () => {
  it("começa com os padrões da spec", () => {
    expect(estadoInicial()).toEqual({
      filtro: "ambos", incluirCapaReel: false, modo: "faixa",
      de: 1, ate: 100, ordenacao: "sequencia", pularBaixados: true,
    });
  });
});

describe("podeOrdenarPorRelevancia", () => {
  it("exige catálogo completo", () => {
    expect(podeOrdenarPorRelevancia(catalogo({ completo: true }))).toBe(true);
    expect(podeOrdenarPorRelevancia(catalogo({ completo: false }))).toBe(false);
  });

  it("catálogo vazio não serve", () => {
    expect(podeOrdenarPorRelevancia({ totalIndexado: 0, completo: true })).toBe(false);
    expect(podeOrdenarPorRelevancia(null)).toBe(false);
  });
});

describe("rotuloDoBotao", () => {
  it("diz a faixa exata", () => {
    expect(rotuloDoBotao({ ...estadoInicial(), de: 500, ate: 1000 }, catalogo()))
      .toBe("Baixar publicações 500–1000");
  });

  it("diz quantas foram marcadas no modo manual", () => {
    expect(rotuloDoBotao({ ...estadoInicial(), modo: "manual" }, catalogo(), 12))
      .toBe("Baixar 12 marcadas");
  });

  it("diz o total no modo tudo", () => {
    expect(rotuloDoBotao({ ...estadoInicial(), modo: "tudo" }, catalogo()))
      .toBe("Baixar tudo (3.000)");
  });

  it("avisa quando não há nada selecionado", () => {
    expect(rotuloDoBotao({ ...estadoInicial(), modo: "manual" }, catalogo(), 0))
      .toBe("Nenhuma publicação marcada");
  });
});

describe("abrirModal", () => {
  it("monta em Shadow DOM e mostra o perfil", async () => {
    await abrir();
    expect(raiz()).toBeTruthy();
    expect(raiz().textContent).toContain("fulano");
  });

  it("mostra o estado do catálogo", async () => {
    await abrir({ carregarCatalogo: async () => catalogo({ totalIndexado: 1240, completo: false }) });
    expect(raiz().textContent).toContain("1.240");
  });

  it("tem as três opções de mídia e o toggle de capa", async () => {
    await abrir();
    expect($$('[name="filtro"]').map((e) => e.value)).toEqual(["ambos", "fotos", "videos"]);
    expect($('[name="incluirCapaReel"]')).toBeTruthy();
  });

  it("tem os três modos de seleção", async () => {
    await abrir();
    expect($$('[name="modo"]').map((e) => e.value)).toEqual(["faixa", "manual", "tudo"]);
  });

  it("tem as cinco ordenações", async () => {
    await abrir();
    expect($$('[name="ordenacao"] option').map((o) => o.value))
      .toEqual(["sequencia", "curtidas", "views", "recentes", "antigos"]);
  });

  it("desabilita relevância com o motivo escrito quando o catálogo está incompleto", async () => {
    await abrir({ carregarCatalogo: async () => catalogo({ completo: false, totalIndexado: 400 }) });
    const opcoes = $$('[name="ordenacao"] option');
    expect(opcoes.find((o) => o.value === "curtidas").disabled).toBe(true);
    expect(opcoes.find((o) => o.value === "views").disabled).toBe(true);
    expect(opcoes.find((o) => o.value === "sequencia").disabled).toBe(false);
    expect(raiz().textContent.toLowerCase()).toContain("indexar o perfil inteiro");
  });

  it("libera relevância com catálogo completo", async () => {
    await abrir();
    const opcoes = $$('[name="ordenacao"] option');
    expect(opcoes.every((o) => !o.disabled)).toBe(true);
  });

  it("atualiza o rótulo do botão ao mexer na faixa", async () => {
    await abrir();
    const de = $('[name="de"]');
    const ate = $('[name="ate"]');
    de.value = "500"; de.dispatchEvent(new Event("input", { bubbles: true }));
    ate.value = "1000"; ate.dispatchEvent(new Event("input", { bubbles: true }));
    expect($(".confirmar").textContent).toBe("Baixar publicações 500–1000");
  });

  it("a régua mostra a janela selecionada dentro do total", async () => {
    await abrir();
    const de = $('[name="de"]');
    const ate = $('[name="ate"]');
    de.value = "1500"; de.dispatchEvent(new Event("input", { bubbles: true }));
    ate.value = "3000"; ate.dispatchEvent(new Event("input", { bubbles: true }));

    const banda = $(".regua-banda");
    // metade final do catálogo: começa nos 50% e ocupa 50%
    expect(parseFloat(banda.style.left)).toBeCloseTo(50, 0);
    expect(parseFloat(banda.style.width)).toBeCloseTo(50, 0);
  });

  it("esconde os campos de faixa no modo tudo", async () => {
    await abrir();
    const tudo = $$('[name="modo"]').find((e) => e.value === "tudo");
    tudo.checked = true;
    tudo.dispatchEvent(new Event("change", { bubbles: true }));
    expect($(".campos-faixa").hidden).toBe(true);
  });

  it("entrega o estado completo ao confirmar", async () => {
    const aoConfirmar = vi.fn();
    await abrir({ aoConfirmar });

    const soVideos = $$('[name="filtro"]').find((e) => e.value === "videos");
    soVideos.checked = true;
    soVideos.dispatchEvent(new Event("change", { bubbles: true }));

    const ordenacao = $('[name="ordenacao"]');
    ordenacao.value = "views";
    ordenacao.dispatchEvent(new Event("change", { bubbles: true }));

    $(".confirmar").click();

    expect(aoConfirmar).toHaveBeenCalledWith(expect.objectContaining({
      filtro: "videos", ordenacao: "views", modo: "faixa", de: 1, ate: 100,
      profileKey: "ig:@fulano",
    }));
  });

  it("dispara a indexação pelo botão próprio", async () => {
    const aoIndexar = vi.fn();
    await abrir({ aoIndexar });
    $(".indexar").click();
    expect(aoIndexar).toHaveBeenCalledOnce();
  });

  it("abre o Acervo completo pelo link", async () => {
    const aoAbrirAcervo = vi.fn();
    await abrir({ aoAbrirAcervo });
    $(".abrir-acervo").click();
    expect(aoAbrirAcervo).toHaveBeenCalledOnce();
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

  it("escreve tudo em português", async () => {
    await abrir();
    const texto = raiz().textContent.toLowerCase();
    expect(texto).not.toMatch(/\bdownload\b|\brange\b|\bmedia type\b/);
  });
});
