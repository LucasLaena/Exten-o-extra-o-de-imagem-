/**
 * Grade virtualizada. Só os itens dentro da janela visível (mais uma margem)
 * existem no DOM; o resto é altura reservada por um espaçador.
 *
 * @param {{ container: HTMLElement, alturaLinha: number, colunas: number,
 *           renderizar: (item, el) => void, aoMudarSelecao?: Function,
 *           margem?: number }} opcoes
 */
export const PROPORCAO_ITEM = 1.25;
/** Espaço do rodapé de cada item: posição, métricas e seq. */
export const ALTURA_RODAPE = 64;
export const ESPACO_ENTRE = 14;

export function criarGrade({
  container, colunas, renderizar, aoMudarSelecao, margem = 2, alturaLinha,
}) {
  let itens = [];
  let porChave = new Map();
  let colunasAtuais = colunas;
  let alturaFixa = alturaLinha ?? null;

  /**
   * Quanto mede uma linha, dada a largura disponível.
   *
   * A virtualização precisa desse número para saber o que está na tela; com
   * ele errado, a grade desenha a faixa errada. Por isso é calculado, e não
   * chutado: mais colunas significam itens menores e linhas mais baixas.
   */
  const medirLinha = () => {
    if (alturaFixa) return alturaFixa;
    const largura = container.clientWidth || 900;
    const doItem = (largura - ESPACO_ENTRE * (colunasAtuais - 1)) / colunasAtuais;
    return Math.max(80, Math.round(doItem * PROPORCAO_ITEM + ALTURA_RODAPE));
  };
  const selecionadas = new Set();
  let ultimaClicada = null;

  container.innerHTML = "";
  container.style.position = "relative";
  container.style.overflowY = "auto";

  const espacador = document.createElement("div");
  espacador.className = "espacador";

  const palco = document.createElement("div");
  palco.className = "palco";
  palco.style.position = "absolute";
  palco.style.left = "0";
  palco.style.right = "0";
  palco.style.top = "0";

  container.append(espacador, palco);

  function desenhar() {
    if (itens.length === 0) {
      palco.innerHTML = "";
      return;
    }

    const altura = medirLinha();
    palco.style.gridTemplateColumns = `repeat(${colunasAtuais}, 1fr)`;

    const linhas = Math.ceil(itens.length / colunasAtuais);
    const primeiraLinha = Math.max(0, Math.floor(container.scrollTop / altura) - margem);
    const linhasVisiveis = Math.ceil(container.clientHeight / altura) + margem * 2;
    const ultimaLinha = Math.min(linhas, primeiraLinha + linhasVisiveis);

    espacador.style.height = `${linhas * altura}px`;
    palco.style.transform = `translateY(${primeiraLinha * altura}px)`;
    palco.innerHTML = "";

    const fragmento = document.createDocumentFragment();
    for (
      let i = primeiraLinha * colunasAtuais;
      i < Math.min(ultimaLinha * colunasAtuais, itens.length);
      i++
    ) {
      const item = itens[i];
      const el = document.createElement("div");
      el.className = "item";
      el.dataset.chave = item.chave;
      el.dataset.posicao = String(item.posicao);
      el.setAttribute("role", "option");
      el.setAttribute("aria-selected", selecionadas.has(item.chave) ? "true" : "false");
      renderizar(item, el);
      fragmento.append(el);
    }
    palco.append(fragmento);
  }

  function avisar() {
    aoMudarSelecao?.(new Set(selecionadas));
  }

  function elementoDe(chave) {
    return [...palco.querySelectorAll("[data-chave]")].find((el) => el.dataset.chave === chave);
  }

  function marcar(chave, ligado) {
    if (ligado) selecionadas.add(chave);
    else selecionadas.delete(chave);
    elementoDe(chave)?.setAttribute("aria-selected", ligado ? "true" : "false");
    avisar();
  }

  function marcarFaixa(dePos, atePos) {
    const inicio = Math.min(dePos, atePos);
    const fim = Math.max(dePos, atePos);
    for (const item of itens) {
      if (item.posicao >= inicio && item.posicao <= fim) selecionadas.add(item.chave);
    }
    desenhar();
    avisar();
  }

  /** Shift-clique marca a faixa: sem isso, marcar 200 itens à mão é inviável. */
  function aoClicarItem(chave, { shift } = {}) {
    const item = porChave.get(chave);
    if (!item) return;

    if (shift && ultimaClicada != null) {
      marcarFaixa(ultimaClicada, item.posicao);
    } else {
      marcar(chave, !selecionadas.has(chave));
    }
    ultimaClicada = item.posicao;
  }

  const aoRolar = () => desenhar();
  container.addEventListener("scroll", aoRolar, { passive: true });

  const aoClicar = (evento) => {
    const el = evento.target.closest("[data-chave]");
    if (el) aoClicarItem(el.dataset.chave, { shift: evento.shiftKey });
  };
  palco.addEventListener("click", aoClicar);

  return {
    definirItens(novos) {
      itens = novos;
      porChave = new Map(novos.map((i) => [i.chave, i]));
      // A seleção antiga é de outra lista: mantê-la selecionaria coisa que o
      // usuário não está mais vendo.
      selecionadas.clear();
      ultimaClicada = null;
      container.scrollTop = 0;
      desenhar();
      avisar();
    },
    /**
     * Muda quantas publicações cabem por linha. Não mexe na seleção: trocar a
     * densidade é ajustar a lente, não escolher outra coisa.
     */
    definirColunas(quantas) {
      colunasAtuais = Math.max(1, Math.trunc(quantas) || 1);
      alturaFixa = null;
      desenhar();
    },
    colunas: () => colunasAtuais,
    selecionadas: () => new Set(selecionadas),
    marcar,
    marcarFaixa,
    aoClicarItem,
    limparSelecao() {
      selecionadas.clear();
      desenhar();
      avisar();
    },
    destruir() {
      container.removeEventListener("scroll", aoRolar);
      palco.removeEventListener("click", aoClicar);
      container.innerHTML = "";
    },
  };
}
