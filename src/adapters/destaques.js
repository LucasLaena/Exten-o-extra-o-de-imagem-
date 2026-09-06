/**
 * Destaques do Instagram, tratados como caminho próprio.
 *
 * Um destaque é limitado — vinte, trinta itens — então não faz sentido faixa,
 * ordenação nem catálogo: entrou no destaque, baixa inteiro. É o oposto do
 * feed, onde 2.000 publicações exigem toda a maquinaria de seleção.
 */

/** `/stories/highlights/{id}/` é a URL que o Instagram usa ao abrir um destaque. */
const CAMINHO = /^\/stories\/highlights\/(\d+)\/?/;

export function ehDestaque(url) {
  return idDoDestaque(url) !== null;
}

export function idDoDestaque(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)instagram\.com$/.test(u.hostname)) return null;
    const achado = u.pathname.match(CAMINHO);
    return achado ? achado[1] : null;
  } catch {
    return null;
  }
}

/** Um item de destaque é foto ou vídeo, e a regra do vídeo é a mesma do feed. */
function midiaDoItem(item, ordem) {
  const video = (item?.video_versions ?? [])
    .slice()
    .sort((a, b) => (b?.width ?? 0) - (a?.width ?? 0))[0];

  if (video?.url) {
    return {
      ordem,
      kind: "video",
      origem: "destaque",
      url: video.url,
      largura: video.width,
      altura: video.height,
      ...(item.video_duration ? { duracao: item.video_duration } : {}),
    };
  }

  // Item que se declara vídeo e não traz vídeo não vira foto: seria a capa.
  if (item?.media_type === 2) return null;

  const foto = (item?.image_versions2?.candidates ?? [])
    .slice()
    .sort((a, b) => (b?.width ?? 0) - (a?.width ?? 0))[0];

  if (!foto?.url) return null;
  return {
    ordem,
    kind: "foto",
    origem: "destaque",
    url: foto.url,
    largura: foto.width,
    altura: foto.height,
  };
}

/**
 * Lê a resposta de `/api/v1/feed/reels_media/`.
 *
 * @returns {{ titulo: string, itens: object[] }}
 */
export function parsearDestaque(json, idBruto) {
  const chave = `highlight:${idBruto}`;
  const bandeja = json?.reels ?? json?.reels_media ?? {};
  const colecao = Array.isArray(bandeja)
    ? bandeja[0]
    : (bandeja[chave] ?? bandeja[idBruto] ?? Object.values(bandeja)[0]);

  if (!colecao) return { titulo: "", itens: [] };

  const itens = [];
  let ordem = 0;

  for (const bruto of colecao.items ?? []) {
    const midia = midiaDoItem(bruto, 0);
    if (!midia) continue;

    itens.push({
      id: String(bruto.pk ?? bruto.id ?? `item-${ordem}`),
      tipo: midia.kind === "video" ? "video" : "foto",
      curtidas: 0,
      views: 0,
      comentarios: 0,
      timestamp: bruto.taken_at ?? 0,
      legenda: "",
      capaUrl: (bruto.image_versions2?.candidates ?? [])[0]?.url ?? "",
      fixado: false,
      destaque: colecao.title ?? "",
      midias: [midia],
    });
    ordem++;
  }

  return { titulo: colecao.title ?? "", itens };
}

/** O adaptador de destaque: mesma interface de mídia que o feed usa. */
export const destaques = {
  id: "destaques",
  prefixo: "ig",
  rotulo: "Destaques",
  ehDestaque,
  idDoDestaque,
  parsearDestaque,

  /**
   * Um destaque baixa inteiro. Filtrar por tipo continua valendo — quem quer
   * só as fotos de um destaque tem esse direito — mas não há faixa nem ordem.
   */
  midiasParaBaixar(post, { filtro }) {
    const passa =
      filtro === "fotos"
        ? (m) => m.kind === "foto"
        : filtro === "videos"
          ? (m) => m.kind === "video"
          : () => true;

    return post.midias.filter(passa).map((midia) => ({ midia, ehCapa: false }));
  },
};
