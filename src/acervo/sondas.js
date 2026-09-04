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
 * Descobre o id do perfil lendo a PRÓPRIA PÁGINA já carregada.
 *
 * Custo zero de rede, e por isso imune ao 429 que o endpoint web_profile_info
 * devolve com facilidade. Esta é a primeira tentativa; a consulta à API é o
 * plano B.
 */
export function lerPerfilDaPagina(handle) {
  const html = document.documentElement ? document.documentElement.innerHTML : "";
  const seguro = String(handle).replace(/[^A-Za-z0-9_]/g, function (c) {
    return "\\" + c;
  });

  const padroes = [
    new RegExp('"id":"(\\d+)","username":"' + seguro + '"', "i"),
    new RegExp('"username":"' + seguro + '","id":"(\\d+)"', "i"),
    new RegExp('"profilePage_(\\d+)"'),
    new RegExp('"user_id":"(\\d+)"'),
    new RegExp('"owner":\\{"id":"(\\d+)"'),
  ];

  for (const padrao of padroes) {
    const achado = html.match(padrao);
    if (achado && achado[1]) return { ok: true, userId: achado[1], fonte: "pagina" };
  }
  return { ok: false, fonte: "pagina" };
}

/**
 * Identifica o perfil do Instagram pelo handle, consultando a API.
 *
 * Plano B: este endpoint é agressivamente limitado e devolve 429 com
 * facilidade. Prefira lerPerfilDaPagina.
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
    const usuario = json && json.data ? json.data.user : null;
    if (!usuario || !usuario.id) {
      return { ok: false, status: resposta.status, erro: "resposta sem data.user" };
    }
    return {
      ok: true,
      status: resposta.status,
      userId: String(usuario.id),
      handle: usuario.username || handle,
      total: usuario.edge_owner_to_timeline_media
        ? usuario.edge_owner_to_timeline_media.count
        : null,
      privado: Boolean(usuario.is_private),
    };
  } catch (erro) {
    return { ok: false, status: 0, erro: String(erro && erro.message ? erro.message : erro) };
  }
}

/** Rola até o fim para o app buscar a próxima página. Devolve a altura nova. */
export function rolarAteOFim() {
  const altura = Math.max(
    document.documentElement.scrollHeight,
    document.body ? document.body.scrollHeight : 0,
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
