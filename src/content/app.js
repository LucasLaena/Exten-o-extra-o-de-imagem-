import { adaptadorDaUrl, chaveDePerfil } from "../adapters/index.js";
import { montarBotao, desmontarBotao } from "./button.js";
import { abrirModal, fecharModal } from "./modal.js";

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
 * O content script faz uma coisa só: mostrar o botão e abrir o Acervo já com o
 * perfil certo. Toda a coleta acontece na aba do Acervo, que executa código
 * aqui dentro via chrome.scripting — sem a cadeia de mensagens que falhava em
 * silêncio.
 */
export function iniciar() {
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
