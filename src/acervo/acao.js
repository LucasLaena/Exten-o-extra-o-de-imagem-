/**
 * A ação que abriu esta aba vale uma vez só.
 *
 * Ela chega pelo endereço (?acao=baixar) para a aba já fazer o que foi pedido
 * em vez de ser um trampolim. O problema é o endereço não esquecer: recarregar
 * a página, ou reabrir o Acervo, disparava de novo um download que ninguém
 * pediu — e como a janela de download cobre a tela, prendia a navegação junto.
 *
 * Consumir é tirar do endereço antes de executar. Depois disso, recarregar
 * mostra o catálogo, que é o que se espera de um recarregamento.
 *
 * @param {string} busca a query string, com ou sem "?"
 * @returns {{ acao: string|null, busca: string }} a ação e o endereço já limpo
 */
export function consumirAcao(busca) {
  const params = new URLSearchParams(busca ?? "");
  const acao = params.get("acao");
  params.delete("acao");

  const resto = params.toString();
  return { acao: acao || null, busca: resto ? `?${resto}` : "" };
}
