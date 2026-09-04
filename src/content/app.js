import { adaptadorDaUrl, chaveDePerfil } from "../adapters/index.js";
import { montarBotao, desmontarBotao } from "./button.js";
import { abrirModal, fecharModal } from "./modal.js";

const FONTE_HOOK = "acervo/pagina";
const FONTE_CONTEUDO = "acervo/conteudo";

/**
 * As duas plataformas são SPA: trocar de página não recarrega nada. O Chrome
 * não emite evento para pushState, então embrulhamos o history — e devolvemos
 * o original no cancelamento, para não deixar sujeira se a extensão recarregar.
 */
export function observarNavegacao(aoMudar) {
  let ultima = null;

  const avisar = () => {
    const atual = window.location.href;
    if (atual === ultima) return;
    ultima = atual;
    aoMudar(atual);
  };

  const pushOriginal = history.pushState;
  const replaceOriginal = history.replaceState;

  history.pushState = function (...args) {
    const r = pushOriginal.apply(this, args);
    avisar();
    return r;
  };
  history.replaceState = function (...args) {
    const r = replaceOriginal.apply(this, args);
    avisar();
    return r;
  };

  window.addEventListener("popstate", avisar);
  avisar();

  return () => {
    history.pushState = pushOriginal;
    history.replaceState = replaceOriginal;
    window.removeEventListener("popstate", avisar);
  };
}

/**
 * A ponte entre o mundo MAIN (hook) e o service worker. O content script é o
 * único que enxerga os dois lados: o hook fala por postMessage, a extensão fala
 * por chrome.runtime.
 */
export function instalarPonte({ chromeApi = chrome, janela = window } = {}) {
  const aguardando = new Map();

  const aoMensagemDaPagina = (evento) => {
    if (evento.source && evento.source !== janela) return;
    const dados = evento.data;
    if (dados?.fonte !== FONTE_HOOK) return;

    if (dados.tipo === "capturou") {
      chromeApi.runtime.sendMessage({ tipo: "capturou", carga: dados.carga });
      return;
    }

    if (dados.tipo === "pagina") {
      const responder = aguardando.get(dados.id);
      if (!responder) return; // resposta de outro pedido, ou já expirado
      aguardando.delete(dados.id);
      responder({ ok: dados.ok, status: dados.status, json: dados.json, erro: dados.erro });
    }
  };

  const aoMensagemDaExtensao = (mensagem, _remetente, responder) => {
    if (mensagem?.tipo !== "paginar") return false;
    aguardando.set(mensagem.id, responder);
    janela.postMessage(
      {
        fonte: FONTE_CONTEUDO,
        tipo: "paginar",
        id: mensagem.id,
        url: mensagem.url,
        init: mensagem.init,
      },
      "*",
    );
    return true; // canal aberto: a resposta chega quando o hook devolver
  };

  janela.addEventListener("message", aoMensagemDaPagina);
  chromeApi.runtime.onMessage.addListener(aoMensagemDaExtensao);

  return () => {
    janela.removeEventListener("message", aoMensagemDaPagina);
    chromeApi.runtime.onMessage.removeListener(aoMensagemDaExtensao);
    aguardando.clear();
  };
}

export function iniciar() {
  instalarPonte();

  observarNavegacao((url) => {
    const adaptador = adaptadorDaUrl(url);
    if (!adaptador) {
      fecharModal();
      desmontarBotao();
      return;
    }

    const handle = adaptador.handleDaUrl(url);
    const profileKey = chaveDePerfil(adaptador, handle);

    montarBotao({
      adaptador,
      handle,
      aoClicar: () =>
        abrirModal({
          adaptador,
          handle,
          profileKey,
          carregarCatalogo: (chave) =>
            chrome.runtime.sendMessage({ tipo: "catalogo", profileKey: chave }),
          aoIndexar: (args) =>
            chrome.runtime.sendMessage({
              tipo: "abrirAcervo",
              perfil: args.profileKey,
              acao: "indexar",
            }),
          aoAbrirAcervo: (args) =>
            chrome.runtime.sendMessage({ tipo: "abrirAcervo", perfil: args.profileKey }),
          aoConfirmar: (pedido) =>
            chrome.runtime.sendMessage({
              tipo: "abrirAcervo",
              perfil: pedido.profileKey,
              acao: "baixar",
              pedido,
            }),
        }),
    });
  });
}
