import {
  ErroBloqueio,
  ehStatusDeBloqueio,
  comRetentativa,
  esperaAleatoria,
  dormir,
} from "../core/queue.js";

export const ESPERA_MIN_MS = 800;
export const ESPERA_MAX_MS = 2000;

/**
 * Orquestra a indexação de um perfil. Toda dependência externa é injetada, o
 * que deixa o laço testável sem rede, sem navegador e sem esperar de verdade.
 *
 * @param {{ adaptador: any, transporte: Function, repo: any,
 *           aoProgresso?: Function, esperar?: Function,
 *           aleatorio?: () => number, baseRetentativa?: number }} deps
 */
export function criarIndexador({
  adaptador,
  transporte,
  repo,
  aoProgresso,
  esperar = dormir,
  aleatorio = Math.random,
  baseRetentativa = 1000,
}) {
  async function buscarPagina(assinatura, cursor, sinal) {
    return comRetentativa(
      async () => {
        const { url, init } = adaptador.proximaPagina(assinatura, cursor);
        const resposta = await transporte(url, { ...init, signal: sinal });

        if (ehStatusDeBloqueio(resposta.status)) throw new ErroBloqueio(resposta.status);
        if (!resposta.ok) throw new Error(`feed respondeu ${resposta.status}`);

        return adaptador.parsear(resposta.json);
      },
      { tentativas: 3, baseMs: baseRetentativa, sinal },
    );
  }

  /**
   * @param {{ profileKey: string, assinatura: object, paginaInicial?: object,
   *           cursor?: string|null, seqInicial?: number, teto?: number|null,
   *           sinal?: AbortSignal }} args
   */
  async function indexar({
    profileKey,
    assinatura,
    paginaInicial = null,
    cursor = null,
    seqInicial = 0,
    teto = null,
    sinal,
  }) {
    let seq = seqInicial;
    let indexados = 0;
    let paginas = 0;
    let completo = false;
    let cursorAtual = cursor;
    let pagina = paginaInicial;

    while (true) {
      if (sinal?.aborted) break;

      if (!pagina) {
        pagina = await buscarPagina(assinatura, cursorAtual, sinal);
      }
      paginas++;

      const lote = pagina.itens.map((bruto) => ({
        ...bruto,
        key: `${profileKey}#${bruto.id}`,
        profileKey,
        seq: ++seq,
      }));

      // Gravar ANTES de pedir a próxima: se cair agora, isto já está salvo.
      await repo.posts.salvarLote(lote);
      indexados += lote.length;
      cursorAtual = pagina.cursor ?? cursorAtual;

      const atingiuTeto = teto != null && indexados >= teto;
      // Página vazia encerra mesmo com temMais: senão o laço gira para sempre.
      completo = !pagina.temMais || lote.length === 0;

      await repo.perfis.salvar({
        key: profileKey,
        cursor: cursorAtual,
        totalIndexado: seq,
        totalDeclarado: pagina.totalDeclarado ?? null,
        completo,
        indexadoEm: Date.now(),
      });

      aoProgresso?.({ indexados, paginas, cursor: cursorAtual, completo });

      if (completo || atingiuTeto) break;

      pagina = null;
      await esperar(esperaAleatoria(ESPERA_MIN_MS, ESPERA_MAX_MS, aleatorio), sinal);
    }

    return { indexados, cursor: cursorAtual, completo, paginas };
  }

  return { indexar };
}
