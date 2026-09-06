import { abrirAcervo as abrirRepoPadrao } from "../core/db.js";

export const URL_ACERVO = "src/acervo/acervo.html";

/**
 * O service worker é só uma ponte — ele não guarda estado nem faz trabalho
 * longo, porque no MV3 é encerrado depois de ~30s ocioso.
 *
 * Ele só responde o estado do catálogo e abre a aba do Acervo. Toda a coleta
 * acontece na aba do Acervo, que executa código dentro da aba do perfil.
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

  async function aoReceberMensagem(mensagem, remetente) {
    switch (mensagem?.tipo) {
      case "catalogo": {
        const banco = await repo();
        const perfil = await banco.perfis.obter(mensagem.profileKey);
        return {
          totalIndexado: perfil?.totalIndexado ?? 0,
          completo: Boolean(perfil?.completo),
        };
      }
      // A coleta agora acontece na pagina do Instagram, e o que ela junta vive
      // na memoria daquela aba. O Acervo tem banco proprio e nao alcanca
      // aquilo: sem esta passagem, catalogar funcionava e a grade continuava
      // vazia — que foi exatamente o que o usuario viu.
      case "guardarPosts": {
        const banco = await repo();
        const posts = mensagem.posts ?? [];

        // Catalogar substitui, nao soma: somar misturava coletas de filtros
        // diferentes e a lista so crescia.
        await banco.posts.limparTudo();
        if (posts.length > 0) await banco.posts.salvarLote(posts);

        await banco.perfis.salvar({
          key: mensagem.profileKey,
          totalIndexado: posts.length,
          totalDeclarado: mensagem.total ?? null,
          completo: Boolean(mensagem.completo),
          indexadoEm: Date.now(),
        });
        return { guardados: posts.length };
      }
      case "abrirAcervo": {
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
