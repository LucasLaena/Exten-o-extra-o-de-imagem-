import { dormir } from "../core/queue.js";
import { montarAssinatura, pareceFeed } from "../core/assinatura.js";
import { drenarCapturas } from "./sondas.js";

export const TENTATIVAS = 24;
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
 * @param {{ executor: object, esperar?: Function, tentativas?: number }} deps
 */
export function criarAprendiz({
  executor,
  esperar = dormir,
  tentativas = TENTATIVAS,
}) {
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
   * @param {{ urlDoPerfil: string, idDoDono?: string|null, adaptador: object,
   *           aoProgresso?: Function, sinal?: AbortSignal }} args
   */
  async function aprender({ urlDoPerfil, idDoDono = null, adaptador, aoProgresso, sinal }) {
    const aba = await executor.acharOuAbrirAba(urlDoPerfil, { visivel: false });

    try {
      for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
        if (sinal?.aborted) throw new ErroDeAssinatura("Cancelado.");

        const capturas = (await executor.rodar(aba.abaId, drenarCapturas)) ?? [];

        for (const captura of capturas) {
          if (!serve(captura, idDoDono, adaptador)) continue;

          const assinatura = montarAssinatura(captura);
          if (!assinatura) continue;

          return { assinatura, pagina: adaptador.parsear(captura.json) };
        }

        aoProgresso?.({ aviso: `Lendo a consulta do perfil… (${tentativa}/${tentativas})` });
        await esperar(ESPERA_MS, sinal);
      }

      throw new ErroDeAssinatura(
        "A página do perfil não consultou o feed no tempo esperado.",
      );
    } finally {
      // A aba é descartável por definição: se ficasse aberta, o ganho de não
      // tomar a tela do usuário se perderia na primeira coleta.
      await executor.fecharSeCriada(aba);
    }
  }

  return { aprender };
}
