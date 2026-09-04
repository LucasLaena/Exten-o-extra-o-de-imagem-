/**
 * Até onde a indexação precisa ir.
 *
 * O catálogo completo é caro: num perfil grande são dezenas de requisições, e
 * se a via rápida falhar, minutos de rolagem. Mas ele só é *necessário* para
 * ordenar por relevância ou por data — aí sim é preciso ver todas as
 * publicações antes de saber quais são as mais vistas, ou as mais recentes.
 *
 * Pedir "1 a 50 na ordem do perfil" são as 50 primeiras. Uma requisição.
 */

/**
 * @param {{ escopo: "faixa"|"tudo", modo: "faixa"|"manual"|"tudo",
 *           ordenacao: string, de?: number, ate?: number }} pedido
 * @returns {number|null} teto de publicações, ou null para indexar tudo
 */
export function tetoDaIndexacao({ escopo, modo, ordenacao, de = 1, ate = 1 }) {
  if (escopo === "tudo") return null;
  if (modo !== "faixa") return null;

  // Só a ordem do perfil é conhecida de antemão. Qualquer outra depende de
  // comparar publicações entre si, e comparar exige tê-las todas.
  if (ordenacao !== "sequencia") return null;

  const fim = Math.max(Number(de) || 1, Number(ate) || 1);
  return Math.max(1, fim);
}

/**
 * Por que o teto foi ignorado, em texto para a tela.
 *
 * Devolve null quando não há nada a explicar: ou o teto valeu, ou o usuário
 * pediu o perfil inteiro de propósito.
 */
export function porQueIndexaTudo({ escopo, modo, ordenacao }) {
  if (escopo === "tudo") return null;

  if (modo === "manual") {
    return "Marcar publicações uma a uma precisa do catálogo inteiro para você ter o que marcar.";
  }
  if (modo === "tudo") return null;

  if (ordenacao === "curtidas" || ordenacao === "views") {
    return "Ordenar pelas mais curtidas ou mais vistas exige catalogar o perfil " +
      "inteiro: não dá para saber quais são as mais vistas sem ver todas.";
  }
  if (ordenacao === "recentes" || ordenacao === "antigos") {
    return "Ordenar por data exige catalogar o perfil inteiro, porque a ordem da " +
      "grade não é a cronológica: publicações fixadas aparecem no topo.";
  }
  return null;
}
