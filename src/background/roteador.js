import { abrirAcervo as abrirRepoPadrao } from "../core/db.js";
import { montarAssinatura } from "../core/assinatura.js";

export const URL_ACERVO = "src/acervo/acervo.html";

/**
 * O service worker é só uma ponte — ele não guarda estado nem faz trabalho
 * longo, porque no MV3 é encerrado depois de ~30s ocioso.
 *
 * A exceção é gravar a assinatura capturada: ele compartilha a origem da
 * extensão, então enxerga o mesmo IndexedDB. Deixar isso para a aba do Acervo
 * perderia a assinatura no fluxo normal, em que a pessoa navega o perfil
 * primeiro e só depois abre o Acervo.
 *
 * @param {typeof chrome} api
 * @param {{ abrirRepo?: Function }} [deps]
 */
export function criarRoteador(api, { abrirRepo = abrirRepoPadrao } = {}) {
  const urlBase = () => api.runtime.getURL(URL_ACERVO);

  let repoPromessa = null;
  const repo = () => (repoPromessa ??= abrirRepo());

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

  async function guardarAssinatura(profileKey, carga) {
    if (!profileKey || !carga) return;
    const assinatura = montarAssinatura(carga);
    // montarAssinatura devolve null quando a URL não é de feed, e nunca copia
    // cookie — a sessão é do navegador e não passa por aqui.
    if (!assinatura) return;
    const banco = await repo();
    await banco.perfis.salvar({ key: profileKey, assinatura });
  }

  async function aoReceberMensagem(mensagem, remetente) {
    switch (mensagem?.tipo) {
      case "capturou": {
        await guardarAssinatura(mensagem.profileKey, mensagem.carga);
        const aba = await acharAba();
        if (aba) {
          await enviarParaAba(aba.id, { ...mensagem, abaDeOrigem: remetente?.tab?.id });
        }
        return undefined;
      }
      case "catalogo": {
        const banco = await repo();
        const perfil = await banco.perfis.obter(mensagem.profileKey);
        return {
          totalIndexado: perfil?.totalIndexado ?? 0,
          completo: Boolean(perfil?.completo),
        };
      }
      case "paginar": {
        return enviarParaAba(mensagem.abaAlvo, mensagem);
      }
      case "abrirAcervo": {
        // A aba do Acervo precisa saber de qual aba do perfil disparar os
        // requests. Só o service worker conhece esse número.
        await abrirAcervo({
          perfil: mensagem.perfil,
          acao: mensagem.acao,
          aba: remetente?.tab?.id,
          pedido: mensagem.pedido ? JSON.stringify(mensagem.pedido) : undefined,
        });
        return undefined;
      }
      default:
        return undefined;
    }
  }

  return { abrirAcervo, aoReceberMensagem };
}
