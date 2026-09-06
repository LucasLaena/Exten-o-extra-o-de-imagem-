/**
 * Quantas publicações um perfil declara ter, lido do que a página já carregou.
 *
 * Serve para dizer o custo antes da pessoa escolher: catalogar 2.000 leva
 * minutos, buscar 50 leva segundos. Escolher às cegas entre duas coisas com
 * custos tão diferentes é o que gera frustração.
 */

/** @param {string} html @param {string} [texto] */
export function extrairTotal(html, texto = "") {
  const doJson = String(html).match(/"edge_owner_to_timeline_media":\{"count":(\d+)/);
  if (doJson) return Number(doJson[1]);

  const doJsonSolto = String(html).match(/"media_count":(\d+)/);
  if (doJsonSolto) return Number(doJsonSolto[1]);

  // Último recurso: o número que a própria página mostra ao lado de
  // "publicações". Vem com separador de milhar em português.
  const doTexto = String(texto).match(/([\d.,]+)\s*(?:mil\s*)?publica/i);
  if (doTexto) {
    const limpo = Number(doTexto[1].replace(/[.,]/g, ""));
    if (Number.isFinite(limpo) && limpo > 0) return limpo;
  }
  return null;
}

/**
 * Quanto tempo a coleta deve levar, em texto.
 *
 * A via rápida traz 50 por requisição, com pausa humanizada entre elas. A
 * estimativa é grosseira de propósito: serve para escolher, não para cronometrar.
 */
export function estimarTempo(quantas) {
  if (!quantas || quantas <= 0) return null;

  const requisicoes = Math.ceil(quantas / 50);
  const segundos = Math.round(requisicoes * 1.5);

  if (segundos < 10) return "poucos segundos";
  if (segundos < 60) return `~${segundos} s`;
  return `~${Math.max(1, Math.round(segundos / 60))} min`;
}
