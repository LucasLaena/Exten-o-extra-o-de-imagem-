/** @typedef {import("./tipos.js").Post} Post */
/** @typedef {import("./tipos.js").Midia} Midia */
/** @typedef {import("./tipos.js").TipoMidia} TipoMidia */

export const TEMPLATE_PADRAO = "{seq}_{data}_{tipo}_{id}";

const PROIBIDOS = /[<>:"\/\\|?*\u0000-\u001f]/g;
const RESERVADOS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const EXTENSOES_CONHECIDAS = new Set([
  "mp4", "mov", "webm", "m4v",
  "jpg", "jpeg", "png", "webp", "heic", "gif",
]);

/**
 * Quantos dígitos usar no número, para que a ordenação alfabética do
 * explorador de arquivos bata com a ordem real do lote.
 */
export function larguraSeq(maiorPosicao) {
  return Math.max(3, String(Math.max(1, Math.trunc(maiorPosicao))).length);
}

/** Deixa um texto seguro como nome de arquivo no Windows. */
export function sanitizar(texto) {
  const limpo = String(texto ?? "")
    .replace(PROIBIDOS, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");

  if (limpo === "") return "sem-nome";
  // O Windows recusa esses nomes mesmo com extensão, então prefixamos.
  if (RESERVADOS.test(limpo)) return `_${limpo}`;
  return limpo;
}

/**
 * Extensão do arquivo. A URL do CDN é a fonte preferida; o tipo da mídia é a
 * rede de segurança quando a URL não diz nada útil.
 */
export function extensaoDe(url, kind) {
  const padrao = kind === "video" ? "mp4" : "jpg";
  let caminho;
  try {
    caminho = new URL(url).pathname;
  } catch {
    return padrao;
  }
  const bruta = caminho.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSOES_CONHECIDAS.has(bruta) ? bruta : padrao;
}

function partesDaData(timestamp) {
  const d = new Date(timestamp * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return {
    data: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
    hora: `${p(d.getUTCHours())}-${p(d.getUTCMinutes())}`,
  };
}

function rotuloDeTipo(post, midia, ehCapa) {
  if (post.tipo === "carrossel") return "carrossel";
  // A capa é um JPEG, mas o arquivo é a capa DE UM REEL. Rotular pela mídia
  // diria "foto" e separaria a capa do vídeo que ela acompanha.
  if (ehCapa) return post.tipo === "video" ? "reel" : "foto";
  return midia.kind === "video" ? "reel" : "foto";
}

/**
 * @param {{ post: Post, midia: Midia, posicao: number, perfil: string,
 *           largura: number, template?: string, ehCapa?: boolean }} args
 */
export function montarNome({
  post,
  midia,
  posicao,
  perfil,
  largura,
  template = TEMPLATE_PADRAO,
  ehCapa = false,
}) {
  const { data, hora } = partesDaData(post.timestamp);

  const tokens = {
    seq: String(posicao).padStart(largura, "0"),
    seqperfil: String(post.seq).padStart(largura === 4 ? 3 : largura, "0"),
    perfil: sanitizar(perfil),
    id: sanitizar(post.id),
    data,
    hora,
    tipo: rotuloDeTipo(post, midia, ehCapa),
    curtidas: String(post.curtidas ?? 0),
    views: String(post.views ?? 0),
    idx: String(midia.ordem ?? 0).padStart(2, "0"),
  };

  const corpo = template.replace(/\{(\w+)(?::(\d+))?\}/g, (_, nome, limite) => {
    if (nome === "legenda") {
      const n = limite ? Number(limite) : 40;
      return sanitizar(String(post.legenda ?? "").slice(0, n));
    }
    return tokens[nome] ?? "";
  });

  const sufixo = ehCapa ? "_capa" : "";
  const ext = extensaoDe(midia.url, midia.kind);
  return `${sanitizar(corpo + sufixo)}.${ext}`;
}

/**
 * Dois posts podem gerar o mesmo nome — mesma data, mesma legenda, template
 * curto. O ZIP aceitaria as duas entradas, mas o Windows sobrescreveria uma na
 * hora de extrair. Cada parte usa um resolvedor próprio.
 */
export function criarResolvedorDeColisao() {
  const vistos = new Map();
  return (nome) => {
    const chave = nome.toLowerCase();
    const n = (vistos.get(chave) ?? 0) + 1;
    vistos.set(chave, n);
    if (n === 1) return nome;

    const ponto = nome.lastIndexOf(".");
    if (ponto <= 0) return `${nome}-${n}`;
    return `${nome.slice(0, ponto)}-${n}${nome.slice(ponto)}`;
  };
}
