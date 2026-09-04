/**
 * Funções que a aba do Acervo executa DENTRO da aba do perfil, via
 * chrome.scripting.executeScript com world: "MAIN".
 *
 * Regras que valem para todas:
 * - São serializadas e enviadas para a outra aba. Não podem fechar sobre
 *   nada deste módulo: tudo que precisam vem por argumento.
 * - O valor de retorno precisa ser serializável (JSON).
 * - Rodam na origem do Instagram/TikTok, com a sessão do navegador. É por
 *   isso que funcionam onde a aba do Acervo, de outra origem, não conseguiria.
 */

export const IG_APP_ID = "936619743392459";

/** Só para o diagnóstico saber que o código roda lá dentro. */
export function pingar() {
  return "ok";
}

/** A captura em document_start (src/page/captura.js) está viva nesta aba? */
export function capturaInstalada() {
  return Boolean(window.__acervo_captura__?.instalado);
}

/** Busca genérica, com a sessão da página. Nunca lança: devolve o erro. */
export async function buscarJson(url, init) {
  try {
    const resposta = await fetch(url, { ...(init ?? {}), credentials: "include" });
    const texto = await resposta.text();
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch {}
    return { ok: resposta.ok && json !== null, status: resposta.status, json };
  } catch (erro) {
    return { ok: false, status: 0, json: null, erro: String(erro?.message ?? erro) };
  }
}

/**
 * Identifica o perfil do Instagram pelo handle. O endpoint web_profile_info
 * devolve o id numérico, que a paginação do feed exige, e o total declarado.
 */
export async function sondarInstagram(handle, appId) {
  const url =
    "https://www.instagram.com/api/v1/users/web_profile_info/?username=" +
    encodeURIComponent(handle);
  try {
    const resposta = await fetch(url, {
      credentials: "include",
      headers: { "x-ig-app-id": appId, "x-requested-with": "XMLHttpRequest" },
    });
    if (!resposta.ok) return { ok: false, status: resposta.status };
    const json = await resposta.json();
    const usuario = json?.data?.user;
    if (!usuario?.id) return { ok: false, status: resposta.status, erro: "resposta sem data.user" };
    return {
      ok: true,
      status: resposta.status,
      userId: String(usuario.id),
      handle: usuario.username ?? handle,
      total: usuario.edge_owner_to_timeline_media?.count ?? null,
      privado: Boolean(usuario.is_private),
    };
  } catch (erro) {
    return { ok: false, status: 0, erro: String(erro?.message ?? erro) };
  }
}

/** Rola até o fim para o app buscar a próxima página. Devolve a altura nova. */
export function rolarAteOFim() {
  const altura = Math.max(
    document.documentElement.scrollHeight,
    document.body?.scrollHeight ?? 0,
  );
  window.scrollTo(0, altura);
  return altura;
}

/** Esvazia o buffer de capturas e devolve o que havia. */
export function drenarCapturas() {
  const fila = Array.isArray(window.__acervo_capturas__) ? window.__acervo_capturas__ : [];
  window.__acervo_capturas__ = [];
  return fila;
}
