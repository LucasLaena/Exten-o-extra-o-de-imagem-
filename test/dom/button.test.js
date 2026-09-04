import { describe, it, expect, vi, beforeEach } from "vitest";
import { montarBotao, desmontarBotao, ID_HOSPEDEIRO } from "../../src/content/button.js";
import { instagram } from "../../src/adapters/instagram.js";
import { tiktok } from "../../src/adapters/tiktok.js";

beforeEach(() => {
  desmontarBotao();
  document.body.innerHTML = "";
});

const hospedeiro = () => document.getElementById(ID_HOSPEDEIRO);

describe("montarBotao", () => {
  it("monta dentro de Shadow DOM, isolado do CSS do site", () => {
    montarBotao({ adaptador: instagram, handle: "fulano", aoClicar: vi.fn() });
    expect(hospedeiro()).toBeTruthy();
    expect(hospedeiro().shadowRoot).toBeTruthy();
    // nada da extensão vaza para o DOM claro da página
    expect(document.body.textContent).not.toContain("Acervo");
  });

  it("mostra o handle do perfil no botão", () => {
    montarBotao({ adaptador: instagram, handle: "fulano", aoClicar: vi.fn() });
    expect(hospedeiro().shadowRoot.textContent).toContain("fulano");
  });

  it("dá identidade visual distinta por plataforma", () => {
    montarBotao({ adaptador: instagram, handle: "a", aoClicar: vi.fn() });
    const estiloIG = hospedeiro().shadowRoot.querySelector("style").textContent;

    desmontarBotao();
    montarBotao({ adaptador: tiktok, handle: "a", aoClicar: vi.fn() });
    const estiloTT = hospedeiro().shadowRoot.querySelector("style").textContent;

    expect(estiloIG).not.toBe(estiloTT);
  });

  it("marca de qual plataforma é, para depuração e para o CSS", () => {
    montarBotao({ adaptador: tiktok, handle: "a", aoClicar: vi.fn() });
    expect(hospedeiro().dataset.plataforma).toBe("tiktok");
  });

  it("chama o callback ao clicar", () => {
    const aoClicar = vi.fn();
    montarBotao({ adaptador: instagram, handle: "a", aoClicar });
    hospedeiro().shadowRoot.querySelector("button").click();
    expect(aoClicar).toHaveBeenCalledOnce();
  });

  it("remonta em vez de duplicar quando chamado de novo", () => {
    montarBotao({ adaptador: instagram, handle: "a", aoClicar: vi.fn() });
    montarBotao({ adaptador: instagram, handle: "b", aoClicar: vi.fn() });
    expect(document.querySelectorAll(`#${ID_HOSPEDEIRO}`)).toHaveLength(1);
    expect(hospedeiro().shadowRoot.textContent).toContain("b");
  });

  it("é acessível pelo teclado e tem rótulo", () => {
    montarBotao({ adaptador: instagram, handle: "a", aoClicar: vi.fn() });
    const botao = hospedeiro().shadowRoot.querySelector("button");
    expect(botao.getAttribute("aria-label")).toBeTruthy();
    expect(botao.tabIndex).toBeGreaterThanOrEqual(0);
  });

  it("escreve em português", () => {
    montarBotao({ adaptador: instagram, handle: "a", aoClicar: vi.fn() });
    const texto = hospedeiro().shadowRoot.textContent.toLowerCase();
    expect(texto).not.toMatch(/\bdownload\b|\bposts?\b/);
  });

  it("respeita quem pediu menos movimento", () => {
    montarBotao({ adaptador: instagram, handle: "a", aoClicar: vi.fn() });
    const estilo = hospedeiro().shadowRoot.querySelector("style").textContent;
    expect(estilo).toContain("prefers-reduced-motion");
  });
});

describe("desmontarBotao", () => {
  it("remove o hospedeiro da página", () => {
    montarBotao({ adaptador: instagram, handle: "a", aoClicar: vi.fn() });
    desmontarBotao();
    expect(hospedeiro()).toBeNull();
  });

  it("é seguro chamar sem nada montado", () => {
    expect(() => desmontarBotao()).not.toThrow();
  });
});
