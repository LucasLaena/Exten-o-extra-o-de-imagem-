//
// Roda no mundo MAIN da página, como SCRIPT CLÁSSICO, em document_start.
// Não pode usar import.
//
// Papel único: guardar num buffer as respostas de feed que o próprio app
// busca. Nada de mensagens — quem lê o buffer é a aba do Acervo, executando
// código aqui dentro via chrome.scripting. Isso elimina toda a cadeia de
// postMessage → content script → service worker que falhava em silêncio.
//
// Os padrões abaixo são cópia literal de PADROES_DE_FEED em
// src/core/assinatura.js; o teste test/dom/captura.test.js falha se divergirem.

(function instalarCapturaDoAcervo() {
  if (window.__acervo_captura__?.instalado) return;

  const PADROES = [
    /\/graphql\/query/,
    /\/api\/v1\/feed\/user\//,
    /\/api\/post\/item_list/,
  ];
  const LIMITE = 50;

  window.__acervo_capturas__ = [];

  const pareceFeed = (url) => typeof url === "string" && PADROES.some((p) => p.test(url));

  const guardar = (captura) => {
    const fila = window.__acervo_capturas__;
    fila.push(captura);
    // Buffer limitado: ninguém drenar por muito tempo não pode virar vazamento.
    if (fila.length > LIMITE) fila.splice(0, fila.length - LIMITE);
  };

  function descreverRequest(entrada, init) {
    if (typeof Request !== "undefined" && entrada instanceof Request) {
      return { url: entrada.url, metodo: entrada.method };
    }
    return { url: String(entrada), metodo: init?.method ?? "GET" };
  }

  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async function fetchDoAcervo(entrada, init) {
    const resposta = await fetchOriginal(entrada, init);
    try {
      const { url, metodo } = descreverRequest(entrada, init);
      if (pareceFeed(url)) {
        // clone(): consumir o corpo original deixaria o app sem dados.
        resposta
          .clone()
          .json()
          .then((json) => guardar({ url, metodo, json, em: Date.now() }))
          .catch(() => {});
      }
    } catch {
      // observação nunca pode quebrar a página
    }
    return resposta;
  };

  const XHR = window.XMLHttpRequest;
  if (XHR) {
    const abrirOriginal = XHR.prototype.open;
    const enviarOriginal = XHR.prototype.send;
    XHR.prototype.open = function (metodo, url, ...resto) {
      this.__acervo = { metodo, url: String(url) };
      return abrirOriginal.call(this, metodo, url, ...resto);
    };
    XHR.prototype.send = function (corpo) {
      try {
        if (pareceFeed(this.__acervo?.url)) {
          this.addEventListener("load", () => {
            try {
              guardar({
                url: this.__acervo.url,
                metodo: this.__acervo.metodo,
                json: JSON.parse(this.responseText),
                em: Date.now(),
              });
            } catch {}
          });
        }
      } catch {}
      return enviarOriginal.call(this, corpo);
    };
  }

  window.__acervo_captura__ = { instalado: true };
})();
