/**
 * O que foi capturado, contado por tipo.
 *
 * Depois de catalogar 2.000 publicações, "2.000" não diz nada útil. Saber que
 * são 1.200 vídeos, 300 fotos e 500 carrosséis com 2.400 páginas é o que
 * permite decidir o que baixar — e perceber na hora quando a coleta trouxe
 * coisa errada.
 */

/** @param {any[]} posts @param {{filtro?: string, incluirCapaReel?: boolean}} [opcoes] */
export function resumirCatalogo(posts, opcoes = {}) {
  const contagem = {
    publicacoes: posts.length,
    fotos: 0,
    videos: 0,
    carrosseis: 0,
    fotosDeCarrossel: 0,
    videosDeCarrossel: 0,
    arquivos: 0,
  };

  for (const post of posts) {
    const midias = post.midias ?? [];

    if (post.tipo === "carrossel") {
      contagem.carrosseis++;
      for (const midia of midias) {
        if (midia.kind === "video") contagem.videosDeCarrossel++;
        else contagem.fotosDeCarrossel++;
      }
    } else if (post.tipo === "video") {
      contagem.videos++;
    } else {
      contagem.fotos++;
    }

    contagem.arquivos += midias.length;
  }

  return contagem;
}

const numero = (n) => new Intl.NumberFormat("pt-BR").format(n ?? 0);
const plural = (n, um, muitos) => `${numero(n)} ${n === 1 ? um : muitos}`;

/**
 * O resumo em texto, só com o que existe.
 *
 * Listar "0 carrosséis" num perfil sem carrossel é ruído: cada linha presente
 * deve significar alguma coisa.
 */
export function textoDoResumo(contagem) {
  if (!contagem || contagem.publicacoes === 0) return "";

  const partes = [];
  if (contagem.fotos > 0) partes.push(plural(contagem.fotos, "foto", "fotos"));
  if (contagem.videos > 0) partes.push(plural(contagem.videos, "vídeo", "vídeos"));

  if (contagem.carrosseis > 0) {
    const dentro = [];
    if (contagem.fotosDeCarrossel > 0) {
      dentro.push(plural(contagem.fotosDeCarrossel, "foto", "fotos"));
    }
    if (contagem.videosDeCarrossel > 0) {
      dentro.push(plural(contagem.videosDeCarrossel, "vídeo", "vídeos"));
    }
    partes.push(
      plural(contagem.carrosseis, "carrossel", "carrosséis") +
        (dentro.length ? ` (${dentro.join(" e ")})` : ""),
    );
  }

  const total = `${plural(contagem.publicacoes, "publicação", "publicações")}`;
  const arquivos = `${plural(contagem.arquivos, "arquivo", "arquivos")}`;

  return `${total}: ${partes.join(" · ")} — ${arquivos} no total`;
}
