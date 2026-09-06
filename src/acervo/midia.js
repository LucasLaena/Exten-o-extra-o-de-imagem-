export const PRAZO_MS = 45_000;

/** Um arquivo que não respondeu a tempo. Vira falha anotada, não travamento. */
export class ErroDePrazo extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroDePrazo";
  }
}

/**
 * Busca uma mídia com prazo.
 *
 * Sem prazo, um único arquivo que o CDN nunca responde pendura o download
 * inteiro — e como a janela de progresso cobre a tela, pendura a tela junto.
 * "Travado" é sempre pior que "falhou": a falha é anotada, o lote segue, e no
 * fim o relatório diz o que ficou faltando.
 *
 * @param {{ buscar?: typeof fetch, prazoMs?: number,
 *           agendar?: Function, cancelarAgenda?: Function }} deps
 */
export function criarBuscadorDeMidia({
  buscar = fetch,
  prazoMs = PRAZO_MS,
  agendar = setTimeout,
  cancelarAgenda = clearTimeout,
} = {}) {
  return async function buscarMidia(url, sinal) {
    if (sinal?.aborted) throw new Error("cancelado");

    // Um controle próprio para o prazo, amarrado ao sinal de fora: cancelar a
    // coleta tem de cortar a requisição também, senão ela segue baixando.
    const controle = new AbortController();
    const repassarCancelamento = () => controle.abort();
    sinal?.addEventListener?.("abort", repassarCancelamento);

    let estourou = false;
    const relogio = agendar(() => {
      estourou = true;
      controle.abort();
    }, prazoMs);

    try {
      const resposta = await buscar(url, { signal: controle.signal });
      if (!resposta.ok) throw new Error(`o CDN respondeu ${resposta.status}`);
      return await resposta.blob();
    } catch (erro) {
      if (estourou) {
        throw new ErroDePrazo(
          `não respondeu em ${Math.round(prazoMs / 1000)}s`,
        );
      }
      throw erro;
    } finally {
      cancelarAgenda(relogio);
      sinal?.removeEventListener?.("abort", repassarCancelamento);
    }
  };
}
