// No TikTok o perfil é /@handle, com um prefixo de idioma opcional antes:
// /pt-BR/@handle é a forma que quem usa o site em português recebe.
// Qualquer segmento a mais depois do handle é outra coisa (/video/, /live).
const HANDLE = /^[A-Za-z0-9._-]{1,30}$/;
const IDIOMA = /^[a-z]{2}(-[A-Za-z]{2,4})?$/;

function segmentos(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)tiktok\.com$/.test(u.hostname)) return null;
    return u.pathname.split("/").filter(Boolean);
  } catch {
    return null;
  }
}

// --- parsing do feed -------------------------------------------------------

function midiasDoItem(item) {
  const fotos = item?.imagePost?.images ?? [];
  if (fotos.length > 0) {
    return fotos
      .map((img, ordem) => {
        const url = img?.imageURL?.urlList?.[0];
        return url
          ? { ordem, kind: "foto", url, largura: img.imageWidth, altura: img.imageHeight }
          : null;
      })
      .filter(Boolean);
  }

  // downloadAddr costuma vir sem marca d'água; playAddr vem com.
  const url = item?.video?.downloadAddr || item?.video?.playAddr;
  if (!url) return [];
  return [
    {
      ordem: 0,
      kind: "video",
      url,
      largura: item.video.width,
      altura: item.video.height,
      ...(item.video.duration ? { duracao: item.video.duration } : {}),
    },
  ];
}

function normalizar(item) {
  const midias = midiasDoItem(item);
  if (midias.length === 0) return null;

  const ehSlideshow = midias[0].kind === "foto";
  const stats = item.stats ?? {};

  return {
    id: String(item.id ?? ""),
    tipo: ehSlideshow ? (midias.length > 1 ? "carrossel" : "foto") : "video",
    curtidas: stats.diggCount ?? 0,
    views: stats.playCount ?? 0,
    comentarios: stats.commentCount ?? 0,
    timestamp: item.createTime ?? 0,
    legenda: item.desc ?? "",
    capaUrl: item?.video?.cover ?? "",
    fixado: Boolean(item.isPinnedItem),
    comMarcaDagua: !ehSlideshow && !item?.video?.downloadAddr,
    midias,
  };
}

const PASSA_NO_FILTRO = {
  ambos: () => true,
  fotos: (m) => m.kind === "foto",
  videos: (m) => m.kind === "video",
};

export const tiktok = {
  id: "tiktok",
  prefixo: "tt",
  rotulo: "TikTok",

  ehPerfil(url) {
    return tiktok.handleDaUrl(url) !== null;
  },

  handleDaUrl(url) {
    let partes = segmentos(url);
    if (!partes) return null;

    // Descarta o prefixo de idioma, quando houver.
    if (partes.length === 2 && IDIOMA.test(partes[0])) partes = partes.slice(1);
    if (partes.length !== 1) return null;

    const [primeiro] = partes;
    if (!primeiro.startsWith("@")) return null;
    const handle = primeiro.slice(1);
    return HANDLE.test(handle) ? handle : null;
  },

  ehRespostaDeFeed(url) {
    try {
      const u = new URL(url);
      if (!/(^|\.)tiktok\.com$/.test(u.hostname)) return false;
      return u.pathname.startsWith("/api/post/item_list");
    } catch {
      return false;
    }
  },

  parsear(json) {
    const raiz = json?.itemList ? json : json?.data?.itemList ? json.data : null;
    if (!raiz) return { itens: [], cursor: null, temMais: false, totalDeclarado: null };

    return {
      itens: (raiz.itemList ?? []).map(normalizar).filter(Boolean),
      cursor: raiz.cursor != null ? String(raiz.cursor) : null,
      temMais: Boolean(raiz.hasMore),
      totalDeclarado: null,
    };
  },

  midiasParaBaixar(post, { filtro, incluirCapaReel }) {
    const passa = PASSA_NO_FILTRO[filtro];
    if (!passa) throw new Error(`filtro de mídia desconhecido: ${filtro}`);

    const escolhidas = post.midias.filter(passa).map((midia) => ({ midia, ehCapa: false }));
    const temVideoEscolhido = escolhidas.some((x) => x.midia.kind === "video");

    if (incluirCapaReel && temVideoEscolhido && post.capaUrl) {
      escolhidas.push({ midia: { ordem: 0, kind: "foto", url: post.capaUrl }, ehCapa: true });
    }
    return escolhidas;
  },

  proximaPagina(assinatura, cursor) {
    if (!assinatura?.url) throw new Error("assinatura sem url");
    const { url, metodo = "GET", headers = {}, paramCursor = "cursor" } = assinatura;
    const u = new URL(url);
    u.searchParams.set(paramCursor, cursor);
    return {
      url: u.toString(),
      init: { method: metodo, headers: { ...headers }, credentials: "include" },
    };
  },
};
