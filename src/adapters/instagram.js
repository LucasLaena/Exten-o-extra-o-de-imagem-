// Primeiro segmento do caminho que o Instagram usa para rotas próprias. Sem
// essa lista, /explore/ e /accounts/ seriam lidos como nome de usuário.
const RESERVADOS = new Set([
  "p", "reel", "reels", "tv", "s", "explore", "accounts", "direct", "stories",
  "challenge", "about", "developer", "legal", "privacy", "terms", "emails",
  "session", "ajax", "api", "graphql", "web", "your_activity", "lite",
  "favorites", "archive", "blog", "business", "creators", "directory", "igtv",
  "locations", "press", "qr", "threads", "sitemap", "topics", "help",
]);

// Sufixos que o próprio perfil aceita depois do handle.
const SUFIXOS = new Set(["", "reels", "tagged", "saved", "channel", "feed"]);

const HANDLE = /^[A-Za-z0-9._]{1,30}$/;

function segmentos(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)instagram\.com$/.test(u.hostname)) return null;
    return u.pathname.split("/").filter(Boolean);
  } catch {
    return null;
  }
}

// --- parsing do feed -------------------------------------------------------

const TIPO_POR_MEDIA_TYPE = { 1: "foto", 2: "video", 8: "carrossel" };
const TIPO_POR_TYPENAME = {
  GraphImage: "foto",
  GraphVideo: "video",
  GraphSidecar: "carrossel",
  XDTGraphImage: "foto",
  XDTGraphVideo: "video",
  XDTGraphSidecar: "carrossel",
};

/** O CDN devolve várias resoluções; queremos sempre a maior. */
function maiorPor(lista, dimensao = "width") {
  if (!Array.isArray(lista) || lista.length === 0) return null;
  return lista.reduce((a, b) => ((b?.[dimensao] ?? 0) > (a?.[dimensao] ?? 0) ? b : a));
}

function midiaDeItemV1(item, ordem) {
  const video = maiorPor(item?.video_versions);
  if (video?.url) {
    return {
      ordem,
      kind: "video",
      url: video.url,
      largura: video.width,
      altura: video.height,
      ...(item.video_duration ? { duracao: item.video_duration } : {}),
    };
  }
  const foto = maiorPor(item?.image_versions2?.candidates);
  if (foto?.url) {
    return { ordem, kind: "foto", url: foto.url, largura: foto.width, altura: foto.height };
  }
  return null;
}

function normalizarV1(item) {
  const tipo = TIPO_POR_MEDIA_TYPE[item?.media_type] ?? "foto";

  const midias =
    tipo === "carrossel"
      ? (item.carousel_media ?? [])
          .map(midiaDeItemV1)
          .filter(Boolean)
          .map((m, i) => ({ ...m, ordem: i }))
      : [midiaDeItemV1(item, 0)].filter(Boolean);

  if (midias.length === 0) return null;

  return {
    id: item.code ?? String(item.pk ?? ""),
    tipo,
    curtidas: item.like_count ?? 0,
    views: item.play_count ?? item.view_count ?? 0,
    comentarios: item.comment_count ?? 0,
    timestamp: item.taken_at ?? 0,
    legenda: item.caption?.text ?? "",
    capaUrl: maiorPor(item?.image_versions2?.candidates)?.url ?? "",
    fixado: Boolean(item.timeline_pinned_user_ids?.length),
    midias,
  };
}

function midiaDeNoLegado(no, ordem) {
  if (no?.video_url) {
    return {
      ordem,
      kind: "video",
      url: no.video_url,
      largura: no.dimensions?.width,
      altura: no.dimensions?.height,
    };
  }
  if (no?.display_url) {
    return {
      ordem,
      kind: "foto",
      url: no.display_url,
      largura: no.dimensions?.width,
      altura: no.dimensions?.height,
    };
  }
  return null;
}

function normalizarLegado(no) {
  const tipo = TIPO_POR_TYPENAME[no?.__typename] ?? "foto";

  const midias =
    tipo === "carrossel"
      ? (no.edge_sidecar_to_children?.edges ?? [])
          .map((e, i) => midiaDeNoLegado(e.node, i))
          .filter(Boolean)
      : [midiaDeNoLegado(no, 0)].filter(Boolean);

  if (midias.length === 0) return null;

  return {
    id: no.shortcode ?? String(no.id ?? ""),
    tipo,
    curtidas: no.edge_media_preview_like?.count ?? no.edge_liked_by?.count ?? 0,
    views: no.video_view_count ?? no.video_play_count ?? 0,
    comentarios: no.edge_media_to_comment?.count ?? 0,
    timestamp: no.taken_at_timestamp ?? 0,
    legenda: no.edge_media_to_caption?.edges?.[0]?.node?.text ?? "",
    capaUrl: no.display_url ?? "",
    fixado: Boolean(no.pinned_for_users?.length),
    midias,
  };
}

/** Acha a conexão do feed em qualquer um dos formatos servidos. */
function localizarConexao(json) {
  if (!json || typeof json !== "object") return null;

  const dados = json.data ?? {};
  const atual = dados.xdt_api__v1__feed__user_timeline_graphql_connection;
  if (atual?.edges) return { formato: "v1", conexao: atual };

  const legado = dados.user?.edge_owner_to_timeline_media;
  if (legado?.edges) return { formato: "legado", conexao: legado };

  if (Array.isArray(json.items)) return { formato: "rest", conexao: json };

  return null;
}

export const instagram = {
  id: "instagram",
  prefixo: "ig",
  rotulo: "Instagram",

  ehPerfil(url) {
    return instagram.handleDaUrl(url) !== null;
  },

  handleDaUrl(url) {
    const partes = segmentos(url);
    if (!partes || partes.length === 0 || partes.length > 2) return null;
    const [handle, sufixo = ""] = partes;
    if (RESERVADOS.has(handle.toLowerCase())) return null;
    if (!HANDLE.test(handle)) return null;
    if (!SUFIXOS.has(sufixo.toLowerCase())) return null;
    return handle;
  },

  ehRespostaDeFeed(url) {
    try {
      const u = new URL(url);
      if (!/(^|\.)instagram\.com$/.test(u.hostname)) return false;
      return (
        u.pathname.startsWith("/graphql/query") ||
        /^\/api\/v1\/feed\/user\//.test(u.pathname)
      );
    } catch {
      return false;
    }
  },

  parsear(json) {
    const achado = localizarConexao(json);
    if (!achado) return { itens: [], cursor: null, temMais: false, totalDeclarado: null };

    const { formato, conexao } = achado;

    if (formato === "rest") {
      return {
        itens: (conexao.items ?? []).map(normalizarV1).filter(Boolean),
        cursor: conexao.next_max_id ?? null,
        temMais: Boolean(conexao.more_available),
        totalDeclarado: null,
      };
    }

    const normalizar = formato === "v1" ? normalizarV1 : normalizarLegado;
    const itens = (conexao.edges ?? []).map((e) => normalizar(e.node)).filter(Boolean);

    return {
      itens,
      cursor: conexao.page_info?.end_cursor ?? null,
      temMais: Boolean(conexao.page_info?.has_next_page),
      totalDeclarado: conexao.count ?? null,
    };
  },
};
