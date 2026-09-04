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
 * Qual perfil está aberto agora. A captura do hook não sabe de quem é o feed
 * que passou; quem sabe é o content script, que acompanha a navegação.
 */
let perfilAtual = null;

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
      chromeApi.runtime.sendMessage({
        tipo: "capturou",
        profileKey: perfilAtual,
        carga: dados.carga,
      });
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

  // O feed já pode ter passado antes de a ponte existir. O hook guarda a
  // última captura justamente para poder repeti-la agora.
  janela.postMessage({ fonte: FONTE_CONTEUDO, tipo: "pedirUltimaCaptura" }, "*");

  return () => {
    janela.removeEventListener("message", aoMensagemDaPagina);
    chromeApi.runtime.onMessage.removeListener(aoMensagemDaExtensao);
    aguardando.clear();
  };
}

export function iniciar() {
  // observarNavegacao primeiro: ela define perfilAtual de forma síncrona, e a
  // ponte pode receber uma captura repetida no instante em que sobe. Na ordem
  // inversa, essa captura chegaria sem saber de que perfil é.
  observarNavegacao((url) => {
    const adaptador = adaptadorDaUrl(url);
    if (!adaptador) {
      perfilAtual = null;
      fecharModal();
      desmontarBotao();
      return;
    }

    const handle = adaptador.handleDaUrl(url);
    const profileKey = chaveDePerfil(adaptador, handle);
    perfilAtual = profileKey;

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

  instalarPonte();
}
