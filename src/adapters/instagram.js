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

// --- escolha de mídia e paginação ------------------------------------------

const PASSA_NO_FILTRO = {
  ambos: () => true,
  fotos: (m) => m.kind === "foto",
  videos: (m) => m.kind === "video",
};

/**
 * Quais mídias deste post vão para o ZIP. A regra do carrossel mora aqui: o
 * filtro age mídia a mídia, não no post inteiro.
 */
function midiasParaBaixar(post, { filtro, incluirCapaReel }) {
  const passa = PASSA_NO_FILTRO[filtro];
  if (!passa) throw new Error(`filtro de mídia desconhecido: ${filtro}`);

  const escolhidas = post.midias.filter(passa).map((midia) => ({ midia, ehCapa: false }));

  // A capa é uma imagem. Com filtro "fotos" ela viraria uma duplicata sem
  // sentido do que já foi baixado, então só entra quando o vídeo entrou.
  const temVideoEscolhido = escolhidas.some((x) => x.midia.kind === "video");
  if (incluirCapaReel && temVideoEscolhido && post.capaUrl) {
    escolhidas.push({
      midia: { ordem: 0, kind: "foto", url: post.capaUrl },
      ehCapa: true,
    });
  }

  return escolhidas;
}

/**
 * Monta o request da próxima página a partir da assinatura aprendida em runtime.
 * Nada aqui é hardcoded: doc_id, headers e formato vêm do que o app acabou de
 * fazer.
 */
function proximaPagina(assinatura, cursor) {
  if (!assinatura?.url) throw new Error("assinatura sem url");

  const { url, metodo = "GET", headers = {}, corpo, paramCursor, ondeVaiOCursor } = assinatura;
  const init = { method: metodo, headers: { ...headers }, credentials: "include" };

  if (ondeVaiOCursor === "query") {
    const u = new URL(url);
    u.searchParams.set(paramCursor, cursor);
    return { url: u.toString(), init };
  }

  if (ondeVaiOCursor === "form") {
    const params = new URLSearchParams(corpo ?? "");
    const variaveis = params.get("variables");
    if (variaveis) {
      const obj = JSON.parse(variaveis);
      obj[paramCursor] = cursor;
      params.set("variables", JSON.stringify(obj));
    } else {
      params.set(paramCursor, cursor);
    }
    init.body = params.toString();
    return { url, init };
  }

  if (ondeVaiOCursor === "json") {
    const obj = JSON.parse(corpo ?? "{}");
    if (obj.variables && typeof obj.variables === "object") {
      obj.variables[paramCursor] = cursor;
    } else {
      obj[paramCursor] = cursor;
    }
    init.body = JSON.stringify(obj);
    return { url, init };
  }

  throw new Error(`não sei onde pôr o cursor: ${ondeVaiOCursor}`);
}

/**
 * Extrai o id numérico do dono do feed de uma resposta já capturada.
 *
 * É a fonte mais confiável que existe para esse id: vem exatamente do mesmo
 * payload que vamos paginar. Ler o HTML da página falha quando o Instagram
 * muda o formato, e o endpoint web_profile_info devolve 429 com facilidade.
 */
function idDoDono(json) {
  if (!json || typeof json !== "object") return null;

  const candidatos = [];
  const dados = json.data ?? {};

  candidatos.push(dados.user?.id);

  const conexoes = [
    dados.xdt_api__v1__feed__user_timeline_graphql_connection,
    dados.user?.edge_owner_to_timeline_media,
  ];
  for (const conexao of conexoes) {
    for (const aresta of conexao?.edges ?? []) {
      candidatos.push(aresta?.node?.user?.pk, aresta?.node?.owner?.id);
    }
  }
  for (const item of json.items ?? []) {
    candidatos.push(item?.user?.pk, item?.owner?.id);
  }

  for (const bruto of candidatos) {
    if (bruto == null) continue;
    const texto = String(bruto);
    if (/^\d+$/.test(texto)) return texto;
  }
  return null;
}

export const instagram = {
  id: "instagram",
  prefixo: "ig",
  rotulo: "Instagram",
  midiasParaBaixar,
  proximaPagina,
  idDoDono,

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
