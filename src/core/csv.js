/** Sem o BOM, o Excel em português lê UTF-8 como Latin-1 e estraga os acentos. */
const BOM = "\uFEFF";

export function escaparCampo(valor) {
  if (valor == null) return "";
  const texto = String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function paraCsv(colunas, linhas) {
  const cabecalho = colunas.map(escaparCampo).join(",");
  const corpo = linhas.map((linha) =>
    colunas.map((coluna) => escaparCampo(linha[coluna])).join(","),
  );
  return `${BOM}${[cabecalho, ...corpo].join("\r\n")}\r\n`;
}

const COLUNAS_ACERVO = [
  "posicao", "seq", "id", "tipo", "curtidas", "views", "comentarios",
  "data", "legenda", "arquivos",
];

const dataLegivel = (timestamp) =>
  new Date(timestamp * 1000).toISOString().slice(0, 10);

/** @param {{post: any, posicao: number, arquivos: string[]}[]} registros */
export function csvDoAcervo(registros) {
  return paraCsv(
    COLUNAS_ACERVO,
    registros.map(({ post, posicao, arquivos }) => ({
      posicao,
      seq: post.seq,
      id: post.id,
      tipo: post.tipo,
      curtidas: post.curtidas,
      views: post.views,
      comentarios: post.comentarios,
      data: dataLegivel(post.timestamp),
      legenda: post.legenda,
      arquivos: arquivos.join(";"),
    })),
  );
}

export function relatorioJson({
  perfil, ordenacao, filtro, partes = [], falhas = [], comMarcaDagua = [],
}) {
  return JSON.stringify(
    {
      geradoEm: new Date().toISOString(),
      perfil,
      ordenacao,
      filtro,
      partes,
      totalDeFalhas: falhas.length,
      falhas,
      comMarcaDagua,
    },
    null,
    2,
  );
}
