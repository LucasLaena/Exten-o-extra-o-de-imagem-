export const URL_ACERVO = "src/acervo/acervo.html";

/**
 * O service worker é só uma ponte. Ele não guarda estado nem faz trabalho
 * longo: no MV3 ele é encerrado depois de ~30s ocioso, e qualquer coisa
 * pesada aqui morreria no meio.
 *
 * @param {typeof chrome} api
 */
export function criarRoteador(api) {
  const urlBase = () => api.runtime.getURL(URL_ACERVO);

  async function acharAba() {
    const abas = await api.tabs.query({ url: `${urlBase()}*` });
    return abas[0] ?? null;
  }

  async function abrirAcervo(params = {}) {
    const url = new URL(urlBase());
    for (const [chave, valor] of Object.entries(params)) {
      if (valor != null) url.searchParams.set(chave, valor);
    }

    const existente = await acharAba();
    if (existente) {
      return api.tabs.update(existente.id, { active: true, url: url.toString() });
    }
    return api.tabs.create({ url: url.toString() });
  }

  /** Enviar para uma aba que fechou rejeita; isso nunca deve derrubar o worker. */
  async function enviarParaAba(abaId, mensagem) {
    try {
      return await api.tabs.sendMessage(abaId, mensagem);
    } catch {
      return undefined;
    }
  }

  async function aoReceberMensagem(mensagem, remetente) {
    switch (mensagem?.tipo) {
      case "capturou": {
        const aba = await acharAba();
        if (!aba) return undefined;
        await enviarParaAba(aba.id, { ...mensagem, abaDeOrigem: remetente?.tab?.id });
        return undefined;
      }
      case "paginar": {
        return enviarParaAba(mensagem.abaAlvo, mensagem);
      }
      case "abrirAcervo": {
        await abrirAcervo({ perfil: mensagem.perfil });
        return undefined;
      }
      default:
        return undefined;
    }
  }

  return { abrirAcervo, aoReceberMensagem };
}
