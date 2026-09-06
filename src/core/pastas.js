/**
 * Onde cada arquivo mora dentro do ZIP.
 *
 * Uma pasta única com 246 arquivos misturados é inutilizável: não dá para
 * saber o que é foto do feed, o que é página de carrossel e o que é capa de
 * vídeo. A separação por origem resolve isso na hora de abrir o ZIP, sem
 * precisar consultar o CSV.
 *
 * Foto e vídeo vão para pastas separadas. Eles têm usos diferentes e pesos
 * muito diferentes: quem foi atrás dos vídeos não quer garimpá-los no meio de
 * centenas de imagens.
 *
 * Carrossel é a exceção, e de propósito: ali o álbum é a unidade. Separar as
 * páginas por tipo desmontaria justamente o que a pasta existe para manter
 * junto e na ordem.
 */

export const PASTA_FEED = "feed";
export const PASTA_FOTOS = "fotos";
export const PASTA_VIDEOS = "videos";
export const PASTA_CARROSSEL = "carrossel";
export const PASTA_CAPAS = "capas";
export const PASTA_DESTAQUES = "destaques";

/**
 * @param {{ post: any, midia: any, ehCapa: boolean, posicao: number,
 *           largura: number }} args
 * @returns {string} caminho relativo dentro do ZIP, sem o nome do arquivo
 */
export function pastaDoArquivo({ post, midia, ehCapa, posicao, largura }) {
  if (ehCapa || midia?.origem === "capa-de-video") return PASTA_CAPAS;

  if (midia?.origem === "destaque") {
    // O nome do destaque vem no post; sem ele, tudo num guarda-chuva só.
    const titulo = sanitizarPasta(post?.destaque ?? "");
    const base = titulo ? `${PASTA_DESTAQUES}/${titulo}` : PASTA_DESTAQUES;
    return `${base}/${porTipo(midia)}`;
  }

  if (post?.tipo === "carrossel" || midia?.origem === "carrossel") {
    const numero = String(posicao ?? 0).padStart(largura ?? 3, "0");
    const id = sanitizarPasta(post?.id ?? "");
    return `${PASTA_CARROSSEL}/${numero}${id ? `_${id}` : ""}`;
  }

  return `${PASTA_FEED}/${porTipo(midia)}`;
}

/** Vídeo ou foto. O kind da mídia manda; o tipo do post é só o desempate. */
function porTipo(midia) {
  return midia?.kind === "video" ? PASTA_VIDEOS : PASTA_FOTOS;
}

/** Nome de pasta seguro: sem separador, sem o que o Windows recusa. */
export function sanitizarPasta(texto) {
  return String(texto ?? "")
    .replace(/[<>:"\/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 60);
}

/** Junta pasta e nome no caminho que o ZIP entende. */
export function caminhoNoZip(pasta, nome) {
  return pasta ? `${pasta}/${nome}` : nome;
}
