import { garantirSubpasta, criarArquivoNaPasta } from "../core/zipper.js";

/** No modo memória a parte inteira precisa caber na RAM. */
export const LIMITE_MEMORIA_BYTES = 500 * 1024 * 1024;

export const temFileSystemAccess = () =>
  typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

/** Exige gesto do usuário; só pode ser chamada de dentro de um handler de clique. */
export function escolherPasta() {
  return window.showDirectoryPicker({ mode: "readwrite", startIn: "downloads" });
}

/**
 * Reautoriza um handle guardado no IndexedDB.
 *
 * `pedir` só pode ser true dentro de um gesto do usuário: fora dele,
 * requestPermission lança, e uma exceção aqui derrubaria a inicialização
 * inteira da aba em silêncio. Na carga da página a resposta é só consultar.
 */
export async function reautorizar(pasta, { pedir = false } = {}) {
  if (!pasta?.queryPermission) return false;
  const opcoes = { mode: "readwrite" };

  try {
    if ((await pasta.queryPermission(opcoes)) === "granted") return true;
    if (!pedir) return false;
    return (await pasta.requestPermission(opcoes)) === "granted";
  } catch {
    return false;
  }
}

/**
 * Destino em disco. A pasta da rodada é criada na hora, com o caminho da spec:
 * Acervo/<plataforma>/@<perfil>/<data>_<hora>/
 */
export async function criarDestinoEmPasta(pastaRaiz, segmentos) {
  const pasta = await garantirSubpasta(pastaRaiz, ...segmentos);
  return {
    caminho: segmentos.join("/"),
    abrirDestino: (nome) => criarArquivoNaPasta(pasta, nome),
    async escreverTexto(nome, texto) {
      const escritor = await criarArquivoNaPasta(pasta, nome);
      await escritor.write(new Blob([texto], { type: "text/plain;charset=utf-8" }));
      await escritor.close();
    },
  };
}

/**
 * Fallback: monta cada parte na memória e entrega por chrome.downloads. Só
 * existe para quando o usuário recusa a pasta — é o único ponto do sistema em
 * que o lote precisa caber na RAM.
 */
export function criarDestinoEmMemoria({ baixar, subpasta = "Acervo" }) {
  const entregar = async (nome, blob) => {
    const url = URL.createObjectURL(blob);
    try {
      await baixar({ url, filename: `${subpasta}/${nome}`, saveAs: false });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  };

  return {
    LIMITE_BYTES: LIMITE_MEMORIA_BYTES,
    caminho: subpasta,
    abrirDestino(nome) {
      const pedacos = [];
      return new WritableStream({
        write: (p) => { pedacos.push(p); },
        close: () => entregar(nome, new Blob(pedacos, { type: "application/zip" })),
      });
    },
    escreverTexto: (nome, texto) =>
      entregar(nome, new Blob([texto], { type: "text/plain;charset=utf-8" })),
  };
}
