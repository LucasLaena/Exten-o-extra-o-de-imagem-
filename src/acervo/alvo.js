import { ADAPTADORES, adaptadorDaUrl, adaptadorPorId, chaveDePerfil } from "../adapters/index.js";

const POR_PREFIXO = { ig: "instagram", tt: "tiktok" };

/** A URL canônica do perfil, que é o que abrimos numa aba. */
function urlCanonica(adaptador, handle) {
  return adaptador.id === "instagram"
    ? `https://www.instagram.com/${handle}/`
    : `https://www.tiktok.com/@${handle}`;
}

/**
 * Entende o que o usuário colou no campo de perfil.
 *
 * Aceita a URL completa, a URL sem protocolo, a chave interna (ig:@fulano) e
 * só o arroba. Devolver um erro em texto é parte do contrato: é ele que
 * aparece na tela.
 *
 * @returns {{ok: true, adaptador: object, handle: string, profileKey: string,
 *             urlDoPerfil: string} | {ok: false, erro: string}}
 */
export function resolverAlvo(entrada) {
  const texto = String(entrada ?? "").trim();
  if (texto === "") {
    return { ok: false, erro: "Cole o endereço do perfil ou o @ dele." };
  }

  // Chave interna, como vem na barra de endereço da própria aba.
  const chave = texto.match(/^(ig|tt):@?([A-Za-z0-9._-]+)$/i);
  if (chave) {
    const adaptador = adaptadorPorId(POR_PREFIXO[chave[1].toLowerCase()]);
    const handle = chave[2];
    return {
      ok: true,
      adaptador,
      handle,
      profileKey: chaveDePerfil(adaptador, handle),
      urlDoPerfil: urlCanonica(adaptador, handle),
    };
  }

  // Só o arroba: assume Instagram, que é o caso comum.
  const arroba = texto.match(/^@([A-Za-z0-9._-]+)$/);
  if (arroba) {
    const adaptador = adaptadorPorId("instagram");
    return {
      ok: true,
      adaptador,
      handle: arroba[1],
      profileKey: chaveDePerfil(adaptador, arroba[1]),
      urlDoPerfil: urlCanonica(adaptador, arroba[1]),
    };
  }

  const comProtocolo = /^https?:\/\//i.test(texto) ? texto : `https://${texto}`;

  let host;
  try {
    host = new URL(comProtocolo).hostname;
  } catch {
    return { ok: false, erro: "Não entendi esse endereço. Cole a URL do perfil." };
  }

  const conhecido = /(^|\.)(instagram|tiktok)\.com$/i.test(host);
  if (!conhecido) {
    return { ok: false, erro: "O Acervo funciona com perfis do Instagram e do TikTok." };
  }

  const adaptador = adaptadorDaUrl(comProtocolo);
  if (!adaptador) {
    return {
      ok: false,
      erro:
        "Esse endereço não é de um perfil. Abra o perfil da pessoa e copie a URL " +
        "da barra de endereço.",
    };
  }

  const handle = adaptador.handleDaUrl(comProtocolo);
  return {
    ok: true,
    adaptador,
    handle,
    profileKey: chaveDePerfil(adaptador, handle),
    urlDoPerfil: urlCanonica(adaptador, handle),
  };
}

/** Os nomes das plataformas, para a interface listar sem repetir texto. */
export const PLATAFORMAS = ADAPTADORES.map((a) => a.rotulo).join(" e ");
