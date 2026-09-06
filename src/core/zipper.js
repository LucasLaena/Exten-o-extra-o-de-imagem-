import { makeZip } from "../vendor/client-zip.js";
import { ErroCancelado } from "./queue.js";

/**
 * @typedef {Object} ItemZip
 * @property {string} nome
 * @property {Uint8Array|Blob|ReadableStream|Response} entrada
 * @property {Date} [data]
 */

/** Traduz nossos itens para o formato do client-zip, contando pelo caminho. */
async function* paraClientZip(itens, estado, aoProgresso, sinal) {
  let indice = 0;
  for await (const item of itens) {
    if (sinal?.aborted) throw new ErroCancelado();

    estado.arquivos++;
    if (item.entrada instanceof Uint8Array) estado.bytes += item.entrada.byteLength;
    else if (typeof Blob !== "undefined" && item.entrada instanceof Blob) {
      estado.bytes += item.entrada.size;
    }

    aoProgresso?.({ nome: item.nome, indice, arquivos: estado.arquivos });
    indice++;

    yield {
      name: item.nome,
      input: item.entrada,
      lastModified: item.data ?? new Date(),
    };
  }
}

/**
 * Escreve um ZIP diretamente num WritableStream. O conteúdo nunca é
 * materializado inteiro na memória: cada arquivo passa e sai.
 *
 * @param {{ itens: AsyncIterable<ItemZip>, destino: WritableStream,
 *           aoProgresso?: Function, sinal?: AbortSignal }} args
 */
export async function escreverZip({ itens, destino, aoProgresso, sinal }) {
  const estado = { arquivos: 0, bytes: 0 };
  const stream = makeZip(paraClientZip(itens, estado, aoProgresso, sinal));
  await stream.pipeTo(destino);
  return estado;
}

/** Caminho de fallback: monta o ZIP inteiro na memória. */
export async function zipEmMemoria(itens) {
  const estado = { arquivos: 0, bytes: 0 };
  const stream = makeZip(paraClientZip(itens, estado));
  return new Response(stream).blob();
}

/** Cria (ou reusa) uma cadeia de subpastas dentro de uma pasta escolhida. */
export async function garantirSubpasta(pasta, ...segmentos) {
  let atual = pasta;
  for (const seg of segmentos) {
    atual = await atual.getDirectoryHandle(seg, { create: true });
  }
  return atual;
}

/** Abre um arquivo para escrita dentro de uma pasta, sobrescrevendo o que houver. */
export async function criarArquivoNaPasta(pasta, nome) {
  const arquivo = await pasta.getFileHandle(nome, { create: true });
  return arquivo.createWritable();
}
