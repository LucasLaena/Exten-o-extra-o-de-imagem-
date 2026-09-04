/** @typedef {import("./tipos.js").Post} Post */
/** @typedef {import("./tipos.js").FiltroMidia} FiltroMidia */
/** @typedef {import("./tipos.js").Ordenacao} Ordenacao */

/** @type {Ordenacao[]} */
export const ORDENACOES = ["sequencia", "curtidas", "views", "recentes", "antigos"];

export const temFoto = (post) => post.midias.some((m) => m.kind === "foto");
export const temVideo = (post) => post.midias.some((m) => m.kind === "video");

/**
 * O filtro decide quais POSTS entram. Quais mídias de dentro de um carrossel
 * serão de fato baixadas é decisão do adaptador, em midiasParaBaixar.
 */
export function filtrarPorMidia(posts, filtro) {
  if (filtro === "ambos") return [...posts];
  if (filtro === "fotos") return posts.filter(temFoto);
  if (filtro === "videos") return posts.filter(temVideo);
  throw new Error(`filtro de mídia desconhecido: ${filtro}`);
}

// Todo comparador desempata por seq crescente. Ordem instável faria os nomes de
// arquivo mudarem entre duas execuções do mesmo pedido.
const COMPARADORES = {
  sequencia: (a, b) => a.seq - b.seq,
  curtidas: (a, b) => b.curtidas - a.curtidas || a.seq - b.seq,
  views: (a, b) => b.views - a.views || a.seq - b.seq,
  recentes: (a, b) => b.timestamp - a.timestamp || a.seq - b.seq,
  antigos: (a, b) => a.timestamp - b.timestamp || a.seq - b.seq,
};

export function ordenar(posts, ordenacao) {
  const cmp = COMPARADORES[ordenacao];
  if (!cmp) throw new Error(`ordenação desconhecida: ${ordenacao}`);
  return [...posts].sort(cmp);
}

/**
 * @param {{ posts: Post[], filtro: FiltroMidia, ordenacao: Ordenacao,
 *           modo: "faixa"|"manual"|"tudo", de?: number, ate?: number,
 *           manuais?: Set<string>, pularBaixados?: boolean,
 *           baixados?: Set<string> }} args
 */
export function resolverSelecao({
  posts,
  filtro,
  ordenacao,
  modo,
  de = 1,
  ate = Infinity,
  manuais = new Set(),
  pularBaixados = false,
  baixados = new Set(),
}) {
  const lista = ordenar(filtrarPorMidia(posts, filtro), ordenacao);

  // Posição é atribuída sobre a lista inteira, antes de qualquer corte, para
  // que o número no nome do arquivo não dependa do que já foi baixado antes.
  const posicoes = new Map(lista.map((p, i) => [p.key, i + 1]));

  let escolhidos;
  if (modo === "tudo") {
    escolhidos = lista;
  } else if (modo === "manual") {
    escolhidos = lista.filter((p) => manuais.has(p.key));
  } else if (modo === "faixa") {
    const inicio = Math.max(1, Math.min(de, ate));
    const fim = Math.max(de, ate);
    escolhidos = lista.filter((p) => {
      const pos = posicoes.get(p.key);
      return (pos >= inicio && pos <= fim) || manuais.has(p.key);
    });
  } else {
    throw new Error(`modo de seleção desconhecido: ${modo}`);
  }

  const antes = escolhidos.length;
  const selecionados = pularBaixados
    ? escolhidos.filter((p) => !baixados.has(p.key))
    : escolhidos;

  return {
    selecionados,
    posicoes,
    total: lista.length,
    pulados: antes - selecionados.length,
  };
}
