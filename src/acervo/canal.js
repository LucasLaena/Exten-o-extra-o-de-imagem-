import { buscarJson, drenarCapturas } from "./sondas.js";

/**
 * Uma aba escondida e parada, usada só como endereço de rede.
 *
 * Requisição feita da aba do Acervo é de outra origem, e o Instagram recusa:
 * o GET da página do perfil passa, mas o POST do GraphQL morre em "Failed to
 * fetch" antes mesmo de sair. Não há cabeçalho que resolva — Sec-Fetch é do
 * navegador, e forçar Origin só troca o erro de lugar.
 *
 * Dentro da página, a mesma requisição é do mesmo domínio e simplesmente
 * funciona. Então a aba existe por isso, e só por isso: fica em segundo
 * plano, nunca rola, nunca toma o foco. Quem manda é a aba do Acervo, de
 * fora, o que também escapa do afogamento de temporizador que trava a rolagem
 * em aba de fundo.
 *
 * @param {{ executor: object, urlDoPerfil: string }} args
 */
export async function abrirCanal({ executor, urlDoPerfil }) {
  const aba = await executor.acharOuAbrirAba(urlDoPerfil, { visivel: false });

  /** Mesma forma de `fetch`, para o coletor não saber que é por aba. */
  async function buscar(url, init) {
    const r = (await executor.rodar(aba.abaId, buscarJson, [url, init ?? null])) ?? {};
    const status = r.status ?? 0;
    return {
      status,
      ok: status >= 200 && status < 300 && r.json != null,
      // Sem json, o texto carrega o motivo cru — é o que permite acertar a
      // causa em vez de ver "falhou" de novo.
      text: async () => (r.json != null ? JSON.stringify(r.json) : (r.erro ?? "")),
    };
  }

  return {
    abaId: aba.abaId,
    buscar,
    async drenar() {
      return (await executor.rodar(aba.abaId, drenarCapturas)) ?? [];
    },
    async fechar() {
      await executor.fecharSeCriada(aba);
    },
  };
}
