/** @typedef {import("./tipos.js").Assinatura} Assinatura */

// O hook (mundo MAIN, script clássico) carrega uma cópia literal desta lista.
// Manter as duas em sincronia é responsabilidade do teste test/dom/hook.test.js.
export const PADROES_DE_FEED = [
  /\/graphql\/query/,
  /\/api\/v1\/feed\/user\//,
  /\/api\/post\/item_list/,
];

/**
 * Headers que o endpoint realmente exige. Copiar tudo quebraria o request:
 * content-length fica errado depois de trocar o cursor, e o navegador descarta
 * headers proibidos em silêncio. Cookie nunca entra — quem anexa é o navegador.
 */
export const HEADERS_RELEVANTES = [
  "content-type",
  "x-ig-app-id",
  "x-csrftoken",
  "x-ig-www-claim",
  "x-asbd-id",
  "x-requested-with",
  "x-fb-friendly-name",
  "x-fb-lsd",
  "x-tt-params",
  "x-secsdk-csrf-token",
];

export function pareceFeed(url) {
  if (typeof url !== "string" || url === "") return false;
  return PADROES_DE_FEED.some((p) => p.test(url));
}

/**
 * Onde este endpoint carrega o cursor de paginação. É o que permite continuar
 * a paginação sem hardcodar doc_id nem formato de corpo.
 */
export function detectarCursor({ url, corpo }) {
  if (!pareceFeed(url)) return null;

  if (/\/api\/v1\/feed\/user\//.test(url)) {
    return { paramCursor: "max_id", ondeVaiOCursor: "query" };
  }
  if (/\/api\/post\/item_list/.test(url)) {
    return { paramCursor: "cursor", ondeVaiOCursor: "query" };
  }

  // GraphQL: o cursor é o "after" dentro de variables. Falta saber se variables
  // chega como campo de form ou dentro de um corpo JSON.
  if (typeof corpo === "string" && corpo.trimStart().startsWith("{")) {
    try {
      JSON.parse(corpo);
      return { paramCursor: "after", ondeVaiOCursor: "json" };
    } catch {
      // corpo malformado: trata como form, que é o caso comum
    }
  }
  return { paramCursor: "after", ondeVaiOCursor: "form" };
}

/** @returns {Assinatura|null} */
export function montarAssinatura({ url, metodo = "GET", headers = {}, corpo = null }) {
  const cursor = detectarCursor({ url, corpo });
  if (!cursor) return null;

  const filtrados = {};
  for (const [nome, valor] of Object.entries(headers)) {
    const chave = nome.toLowerCase();
    if (HEADERS_RELEVANTES.includes(chave)) filtrados[chave] = valor;
  }

  return { url, metodo, headers: filtrados, corpo, ...cursor };
}
