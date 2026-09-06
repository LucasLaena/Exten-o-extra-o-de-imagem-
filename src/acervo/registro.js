export const LIMITE = 300;

/**
 * O que aconteceu, em ordem, com hora.
 *
 * Existe porque a tela contava mal a história: a linha de estado é
 * sobrescrita pelo passo seguinte em menos de um segundo, e o redesenho
 * repunha "Catálogo vazio" por cima do erro. Diagnosticar virou adivinhação
 * — várias rodadas gastas atrás de uma informação que o programa tinha e
 * jogava fora.
 *
 * Aqui nada é sobrescrito. Um print da tela passa a bastar.
 *
 * @param {{ agora?: () => number, limite?: number }} deps
 */
export function criarRegistro({ agora = () => Date.now(), limite = LIMITE } = {}) {
  /** @type {{ em: number, hora: string, texto: string, tipo: string }[]} */
  let linhas = [];

  const doisDigitos = (n) => String(n).padStart(2, "0");

  function horaDe(em) {
    const d = new Date(em);
    return `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}:` +
      `${doisDigitos(d.getSeconds())}`;
  }

  /**
   * @param {string} texto
   * @param {"passo"|"erro"|"fim"} tipo
   */
  function anotar(texto, tipo = "passo") {
    const em = agora();
    linhas.push({ em, hora: horaDe(em), texto: String(texto), tipo });
    // Uma coleta longa nao pode virar vazamento de memoria.
    if (linhas.length > limite) linhas = linhas.slice(-limite);
    return linhas[linhas.length - 1];
  }

  const anotarErro = (texto) => anotar(texto, "erro");
  const anotarFim = (texto) => anotar(texto, "fim");

  const todas = () => [...linhas];

  /** Texto puro, para colar numa conversa em vez de mandar print. */
  const texto = () => linhas.map((l) => `${l.hora} ${l.texto}`).join("\n");

  function limpar() {
    linhas = [];
  }

  return { anotar, anotarErro, anotarFim, todas, texto, limpar };
}
