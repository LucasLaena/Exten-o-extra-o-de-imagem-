import { extensaoViva, ErroDeExtensaoMorta } from "./vida.js";

export const PEDIDO = "__acervo_pedir_capturas__";
export const RESPOSTA = "__acervo_capturas__";
export const ESPERA_RESPOSTA_MS = 1000;

/**
 * A própria página como canal de coleta.
 *
 * Esta é a peça que dispensa a outra aba. Aqui dentro tudo o que era difícil
 * fica trivial: a requisição é do mesmo domínio e ninguém reclama de origem, e
 * a página está renderizada de verdade — então uma rolagem realmente rola, o
 * que numa aba de segundo plano nunca aconteceu, porque o Chrome não desenha
 * aba que ninguém está vendo.
 *
 * O capturador vive no mundo MAIN e esta função no mundo isolado. O par de
 * eventos é a única forma de os dois se falarem.
 *
 * @param {{ janela?: Window, esperaMs?: number, api?: typeof chrome }} deps
 */
export function criarCanalDaPagina({
  janela = window,
  esperaMs = ESPERA_RESPOSTA_MS,
  api = globalThis.chrome,
} = {}) {
  /** Pede ao capturador o que ele viu, e desiste em vez de esperar para sempre. */
  function drenar() {
    return new Promise((resolver) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let relogio = null;

      const aoResponder = (evento) => {
        if (evento?.detail?.id !== id) return;
        janela.removeEventListener(RESPOSTA, aoResponder);
        clearTimeout(relogio);
        resolver(evento.detail.capturas ?? []);
      };

      janela.addEventListener(RESPOSTA, aoResponder);
      relogio = setTimeout(() => {
        // Sem capturador do outro lado ninguém responde. Lista vazia deixa o
        // aprendiz seguir tentando, que é melhor do que travar.
        janela.removeEventListener(RESPOSTA, aoResponder);
        resolver([]);
      }, esperaMs);

      janela.dispatchEvent(new CustomEvent(PEDIDO, { detail: { id } }));
    });
  }

  /**
   * Um empurrão para a página pedir a próxima leva.
   *
   * O Instagram não consulta o feed ao carregar: as primeiras publicações vêm
   * dentro do HTML, e a consulta de paginação só sai quando a grade é
   * alcançada. Este é o único momento em que algo rola — depois dele a
   * paginação é toda nossa.
   */
  async function cutucar() {
    try {
      janela.scrollBy({ top: janela.innerHeight * 2, behavior: "auto" });
    } catch {
      // Página que não deixa rolar não impede o resto de tentar.
    }
  }

  /** Do mesmo domínio: nada de CORS, nada de cabeçalho para disfarçar. */
  async function buscar(url, init) {
    try {
      return await janela.fetch(url, { ...(init ?? {}), credentials: "include" });
    } catch (erro) {
      // Content script órfão nao tem mais rede: a falha chega como "Failed to
      // fetch" e parece problema de conexao. Conferir aqui e o que separa
      // "recarregue a pagina" de uma cacada por causa inexistente.
      if (!extensaoViva(api)) throw new ErroDeExtensaoMorta();
      throw erro;
    }
  }

  return {
    abaId: "a própria página",
    drenar,
    cutucar,
    buscar,
    // Não há aba para fechar: a página é do usuário e continua onde estava.
    async fechar() {},
  };
}
