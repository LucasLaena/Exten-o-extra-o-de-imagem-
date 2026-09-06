import { larguraSeq } from "./naming.js";

/** @typedef {import("./tipos.js").Post} Post */

export const TAMANHO_PADRAO_PARTE = 100;

export function nomeDaParte(n, primeiraPos, ultimaPos, largura) {
  const num = String(n).padStart(2, "0");
  const de = String(primeiraPos).padStart(largura, "0");
  const ate = String(ultimaPos).padStart(largura, "0");
  return `parte-${num}_posts-${de}-${ate}.zip`;
}

/**
 * Quebra a seleção em partes. A unidade é o POST: um carrossel de dez fotos
 * ocupa uma vaga e nunca é dividido entre dois arquivos ZIP.
 *
 * @param {Post[]} selecionados Já filtrados e ordenados.
 * @param {Map<string, number>} posicoes key do post -> posição na lista.
 * @param {number} [tamanho]
 */
export function particionar(selecionados, posicoes, tamanho = TAMANHO_PADRAO_PARTE) {
  if (!Number.isInteger(tamanho) || tamanho < 1) {
    throw new Error(`tamanho de partição inválido: ${tamanho}`);
  }
  if (selecionados.length === 0) return [];

  const maiorPos = Math.max(...selecionados.map((p) => posicoes.get(p.key) ?? 0));
  const largura = larguraSeq(maiorPos);

  const partes = [];
  for (let i = 0; i < selecionados.length; i += tamanho) {
    const posts = selecionados.slice(i, i + tamanho);
    const primeiraPos = posicoes.get(posts[0].key);
    const ultimaPos = posicoes.get(posts.at(-1).key);
    const n = partes.length + 1;
    partes.push({
      n,
      posts,
      primeiraPos,
      ultimaPos,
      nome: nomeDaParte(n, primeiraPos, ultimaPos, largura),
    });
  }
  return partes;
}
