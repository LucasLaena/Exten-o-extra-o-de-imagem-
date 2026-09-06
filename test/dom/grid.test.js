import { describe, it, expect, vi, beforeEach } from "vitest";
import { criarGrade } from "../../src/acervo/grid.js";

const itens = (n) =>
  Array.from({ length: n }, (_, i) => ({ chave: `k${i}`, posicao: i + 1, titulo: `item ${i}` }));

let container;
let grade;

function montar(opcoes = {}) {
  container = document.createElement("div");
  // jsdom não faz layout: fixamos as medidas na mão.
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  Object.defineProperty(container, "clientWidth", { value: 900, configurable: true });
  document.body.append(container);

  grade = criarGrade({
    container,
    alturaLinha: 200,
    colunas: 3,
    renderizar: (item, el) => { el.textContent = item.titulo; },
    margem: 1,
    ...opcoes,
  });
  return grade;
}

const desenhados = () => [...container.querySelectorAll("[data-chave]")];

beforeEach(() => { grade?.destruir(); document.body.innerHTML = ""; });

describe("virtualização", () => {
  it("desenha só a janela visível, não os 3000 itens", () => {
    montar().definirItens(itens(3000));
    // 600px / 200px = 3 linhas visíveis, + 1 de margem em cada lado
    expect(desenhados().length).toBeLessThanOrEqual(5 * 3);
    expect(desenhados().length).toBeGreaterThan(0);
  });

  it("reserva a altura total, para a barra de rolagem ficar certa", () => {
    montar().definirItens(itens(3000));
    const espacador = container.querySelector(".espacador");
    expect(espacador.style.height).toBe(`${Math.ceil(3000 / 3) * 200}px`);
  });

  it("troca o conteúdo ao rolar", () => {
    montar().definirItens(itens(3000));
    const antes = desenhados().map((e) => e.dataset.chave);

    container.scrollTop = 200 * 100;
    container.dispatchEvent(new Event("scroll"));

    const depois = desenhados().map((e) => e.dataset.chave);
    expect(depois).not.toEqual(antes);
    expect(depois[0]).not.toBe("k0");
  });

  it("desenha os itens com o conteúdo do renderizador", () => {
    montar().definirItens(itens(10));
    expect(desenhados()[0].textContent).toBe("item 0");
  });

  it("aguenta lista vazia", () => {
    montar().definirItens([]);
    expect(desenhados()).toHaveLength(0);
  });

  it("aguenta menos itens que uma tela", () => {
    montar().definirItens(itens(2));
    expect(desenhados()).toHaveLength(2);
  });

  it("redesenha do zero ao trocar a lista", () => {
    const g = montar();
    g.definirItens(itens(3000));
    g.definirItens(itens(4));
    expect(desenhados()).toHaveLength(4);
  });
});

describe("densidade", () => {
  it("troca quantas publicações cabem por linha", () => {
    const g = montar({ colunas: 3, alturaLinha: undefined });
    g.definirItens(itens(60));
    expect(g.colunas()).toBe(3);

    g.definirColunas(10);
    expect(g.colunas()).toBe(10);
    expect(container.querySelector(".palco").style.gridTemplateColumns)
      .toBe("repeat(10, 1fr)");
  });

  it("mais colunas cabem mais publicações na tela", () => {
    const g = montar({ colunas: 3, alturaLinha: undefined });
    g.definirItens(itens(300));
    const com3 = desenhados().length;

    g.definirColunas(10);
    const com10 = desenhados().length;

    // Itens menores significam linhas mais baixas e mais itens visíveis.
    expect(com10).toBeGreaterThan(com3);
  });

  it("recalcula a altura reservada, senão a rolagem mente", () => {
    const g = montar({ colunas: 3, alturaLinha: undefined });
    g.definirItens(itens(300));
    const alturaCom3 = container.querySelector(".espacador").style.height;

    g.definirColunas(10);
    const alturaCom10 = container.querySelector(".espacador").style.height;

    expect(alturaCom10).not.toBe(alturaCom3);
    expect(parseFloat(alturaCom10)).toBeLessThan(parseFloat(alturaCom3));
  });

  it("não perde a seleção ao mudar a densidade", () => {
    const g = montar({ colunas: 3, alturaLinha: undefined });
    g.definirItens(itens(50));
    g.marcarFaixa(1, 5);

    g.definirColunas(10);

    expect(g.selecionadas().size).toBe(5);
  });

  it("recusa densidade absurda em vez de dividir por zero", () => {
    const g = montar({ colunas: 3, alturaLinha: undefined });
    g.definirItens(itens(10));
    g.definirColunas(0);
    expect(g.colunas()).toBe(1);
    g.definirColunas(-4);
    expect(g.colunas()).toBe(1);
  });
});

describe("seleção", () => {
  it("marca e desmarca um item", () => {
    const g = montar();
    g.definirItens(itens(10));
    g.marcar("k0", true);
    expect(g.selecionadas().has("k0")).toBe(true);
    g.marcar("k0", false);
    expect(g.selecionadas().has("k0")).toBe(false);
  });

  it("marca uma faixa de posições", () => {
    const g = montar();
    g.definirItens(itens(100));
    g.marcarFaixa(10, 20);
    expect(g.selecionadas().size).toBe(11);
    expect(g.selecionadas().has("k9")).toBe(true);  // posição 10
    expect(g.selecionadas().has("k19")).toBe(true); // posição 20
    expect(g.selecionadas().has("k20")).toBe(false);
  });

  it("shift-clique marca a faixa entre o último e o atual", () => {
    const g = montar();
    g.definirItens(itens(100));
    g.aoClicarItem("k4", {});
    g.aoClicarItem("k9", { shift: true });
    expect(g.selecionadas().size).toBe(6);
  });

  it("shift-clique funciona de trás para a frente", () => {
    const g = montar();
    g.definirItens(itens(100));
    g.aoClicarItem("k9", {});
    g.aoClicarItem("k4", { shift: true });
    expect(g.selecionadas().size).toBe(6);
  });

  it("clique sem shift alterna o item", () => {
    const g = montar();
    g.definirItens(itens(10));
    g.aoClicarItem("k1", {});
    expect(g.selecionadas().has("k1")).toBe(true);
    g.aoClicarItem("k1", {});
    expect(g.selecionadas().has("k1")).toBe(false);
  });

  it("avisa a cada mudança de seleção", () => {
    const aoMudarSelecao = vi.fn();
    const g = montar({ aoMudarSelecao });
    g.definirItens(itens(10));
    g.marcar("k0", true);
    expect(aoMudarSelecao).toHaveBeenCalledWith(expect.any(Set));
    expect(aoMudarSelecao.mock.calls.at(-1)[0].size).toBe(1);
  });

  it("marca visualmente o item selecionado que está na tela", () => {
    const g = montar();
    g.definirItens(itens(10));
    g.marcar("k0", true);
    expect(desenhados()[0].getAttribute("aria-selected")).toBe("true");
  });

  it("preserva a seleção ao rolar para longe e voltar", () => {
    const g = montar();
    g.definirItens(itens(3000));
    g.marcar("k0", true);
    container.scrollTop = 200 * 100;
    container.dispatchEvent(new Event("scroll"));
    container.scrollTop = 0;
    container.dispatchEvent(new Event("scroll"));
    expect(desenhados()[0].getAttribute("aria-selected")).toBe("true");
  });

  it("limpa a seleção", () => {
    const g = montar();
    g.definirItens(itens(10));
    g.marcarFaixa(1, 5);
    g.limparSelecao();
    expect(g.selecionadas().size).toBe(0);
  });

  it("trocar a lista limpa a seleção, que não vale mais", () => {
    const g = montar();
    g.definirItens(itens(10));
    g.marcar("k0", true);
    g.definirItens(itens(10));
    expect(g.selecionadas().size).toBe(0);
  });
});

describe("destruir", () => {
  it("solta os ouvintes e esvazia o container", () => {
    const g = montar();
    g.definirItens(itens(10));
    g.destruir();
    expect(container.innerHTML).toBe("");
  });
});
