export const TEMPO_LIMITE_PADRAO = 30_000;

let contador = 0;

/**
 * O request precisa sair da origem da plataforma, então quem executa é o hook.
 * Esta função só empacota o pedido e espera a resposta voltar pela cadeia
 * aba do Acervo -> service worker -> content script -> hook.
 */
export function criarTransporteViaHook({ abaAlvo, enviar, tempoLimite = TEMPO_LIMITE_PADRAO }) {
  return async function transportar(url, init) {
    const id = `acervo-${Date.now()}-${++contador}`;
    const pedido = { tipo: "paginar", abaAlvo, id, url, init };

    // Sem o tempo limite, uma aba que travou penduraria a indexação para sempre.
    const estouro = new Promise((resolve) =>
      setTimeout(
        () => resolve({ ok: false, status: 0, json: null, erro: "tempo esgotado" }),
        tempoLimite,
      ),
    );

    try {
      const resposta = await Promise.race([enviar(pedido), estouro]);
      if (!resposta) {
        return { ok: false, status: 0, json: null, erro: "sem resposta da aba do perfil" };
      }
      return resposta;
    } catch (erro) {
      return { ok: false, status: 0, json: null, erro: String(erro?.message ?? erro) };
    }
  };
}
