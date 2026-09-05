import { dormir } from "../core/queue.js";
import { montarAssinatura, pareceFeed } from "../core/assinatura.js";

export const TENTATIVAS = 60;
export const CUTUCAR_APOS = 4;
export const ESPERA_MS = 500;

/** Falha ao aprender a consulta. Sempre recuperável: a rolagem ainda resta. */
export class ErroDeAssinatura extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroDeAssinatura";
    this.recuperavel = true;
  }
}

/**
 * Aprende, numa passada rápida pela aba, a consulta que a página faz.
 *
 * Esta é a peça que faltava para coletar sem depender da tela. O endpoint
 * /api/v1/ é a API privada do aplicativo de celular: requisição vinda de
 * navegador recebe a página do site de volta, por mais cabeçalhos que se
 * ajuste — nenhum ajuste de Sec-Fetch resolve, porque o Chrome nem deixa a
 * extensão forçar esses cabeçalhos. O site usa GraphQL, com um doc_id que muda
 * com o tempo e só existe dentro da página.
 *
 * Então a aba serve para uma coisa só: ver a consulta que o próprio Instagram
 * dispara ao carregar o perfil. Ela nasce em segundo plano, vive alguns
 * segundos e fecha. Nada de rolagem, nada de foco roubado — e a paginação
 * inteira acontece depois, daqui, sem aba nenhuma.
 *
 * @param {{ esperar?: Function, tentativas?: number }} deps
 */
export function criarAprendiz({
  esperar = dormir,
  tentativas = TENTATIVAS,
} = {}) {
  /**
   * Serve para paginar?
   *
   * O dono é conferido porque o buffer de capturas sobrevive à navegação: sem
   * esta guarda, o catálogo de um perfil recebia publicações de outro.
   */
  function serve(captura, idDoDono, adaptador) {
    if (!captura?.json || !pareceFeed(captura.url)) return false;
    if (!idDoDono) return true;

    const dono = adaptador.idDoDono?.(captura.json);
    return !dono || String(dono) === String(idDoDono);
  }

  /**
   * @param {{ canal: object, idDoDono?: string|null, adaptador: object,
   *           aoProgresso?: Function, sinal?: AbortSignal }} args
   */
  async function aprender({ canal, idDoDono = null, adaptador, aoProgresso, sinal }) {
    // Contadas para o erro poder dizer o que de fato aconteceu: esperar por
    // uma consulta que nunca veio e ver a consulta e nao conseguir usa-la sao
    // problemas diferentes, e confundi-los ja custou rodadas de diagnostico.
    let vistas = 0;
    let recusadas = 0;

    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
      if (sinal?.aborted) throw new ErroDeAssinatura("Cancelado.");

      for (const captura of await canal.drenar()) {
        if (!serve(captura, idDoDono, adaptador)) continue;
        vistas++;

        const assinatura = montarAssinatura(captura);
        if (!assinatura) {
          recusadas++;
          continue;
        }

        return { assinatura, pagina: adaptador.parsear(captura.json) };
      }

      // Algumas paginas so consultam o feed quando a grade e alcancada.
      // O cutucao acontece na aba escondida e nao substitui a paginacao: ele
      // so arranca a primeira requisicao, que e a que ensina a consulta.
      if (tentativa >= CUTUCAR_APOS) await canal.cutucar?.();

      aoProgresso?.({ aviso: `Lendo a consulta do perfil… (${tentativa}/${tentativas})` });
      await esperar(ESPERA_MS, sinal);
    }

    throw new ErroDeAssinatura(
      recusadas > 0
        ? `Vi ${recusadas} consulta(s) do feed, mas sem o doc_id que permite ` +
          "repeti-las. O Instagram deve ter mudado o formato."
        : "A página do perfil não consultou o feed no tempo esperado.",
    );
  }

  return { aprender };
}
