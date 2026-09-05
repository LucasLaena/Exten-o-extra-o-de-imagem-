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

  function cabecalhosDe(headers) {
    const saida = {};
    if (!headers) return saida;
    try {
      if (typeof Headers !== "undefined" && headers instanceof Headers) {
        headers.forEach(function (valor, nome) { saida[String(nome).toLowerCase()] = valor; });
      } else if (Array.isArray(headers)) {
        for (const par of headers) saida[String(par[0]).toLowerCase()] = par[1];
      } else {
        for (const nome of Object.keys(headers)) {
          saida[String(nome).toLowerCase()] = headers[nome];
        }
      }
    } catch {}
    return saida;
  }

  /**
   * O corpo, em texto, venha ele de onde vier.
   *
   * É a parte que carrega o doc_id e as variables — sem ela a consulta não
   * pode ser repetida de fora, e o que chega ao Instagram é um pedido vazio
   * que ele responde com 500. Ler só init.body perde o caso de
   * fetch(new Request(url, {body})), que é o que o app de fato usa.
   */
  function textoDeCorpoCru(cru) {
    if (cru == null) return null;
    if (typeof cru === "string") return cru;
    if (typeof URLSearchParams !== "undefined" && cru instanceof URLSearchParams) {
      return cru.toString();
    }
    if (typeof FormData !== "undefined" && cru instanceof FormData) {
      try {
        return new URLSearchParams(Array.from(cru)).toString();
      } catch { return null; }
    }
    try { return String(cru); } catch { return null; }
  }

  async function corpoDe(entrada, init, clone) {
    const cru = init && init.body != null ? init.body : null;
    if (cru != null) return textoDeCorpoCru(cru);

    // O clone tem de ser feito ANTES do fetch: depois, o corpo já foi lido.
    if (clone) {
      try { return await clone.text(); } catch { return null; }
    }
    return null;
  }

  function urlEMetodo(entrada, init) {
    if (typeof Request !== "undefined" && entrada instanceof Request) {
      return { url: entrada.url, metodo: entrada.method, headers: cabecalhosDe(entrada.headers) };
    }
    return {
      url: String(entrada),
      metodo: (init && init.method) || "GET",
      headers: cabecalhosDe(init && init.headers),
    };
  }

  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async function fetchDoAcervo(entrada, init) {
    let clone = null;
    let descricao = null;
    try {
      descricao = urlEMetodo(entrada, init);
      if (pareceFeed(descricao.url) && typeof Request !== "undefined"
          && entrada instanceof Request) {
        clone = entrada.clone();
      }
    } catch {
      // observação nunca pode quebrar a página
    }

    const resposta = await fetchOriginal(entrada, init);

    try {
      if (descricao && pareceFeed(descricao.url)) {
        // clone(): consumir o corpo original deixaria o app sem dados.
        const dados = resposta.clone().json();
        Promise.all([dados, corpoDe(entrada, init, clone)])
          .then(function (par) {
            guardar({ ...descricao, corpo: par[1], json: par[0], em: Date.now() });
          })
          .catch(() => {});
      }
    } catch {
      // idem
    }
    return resposta;
  };

  const XHR = window.XMLHttpRequest;
  if (XHR) {
    const abrirOriginal = XHR.prototype.open;
    const enviarOriginal = XHR.prototype.send;
    const cabecalhoOriginal = XHR.prototype.setRequestHeader;

    XHR.prototype.open = function (metodo, url, ...resto) {
      this.__acervo = { metodo, url: String(url), headers: {} };
      return abrirOriginal.call(this, metodo, url, ...resto);
    };

    XHR.prototype.setRequestHeader = function (nome, valor) {
      try {
        if (this.__acervo) this.__acervo.headers[String(nome).toLowerCase()] = valor;
      } catch {}
      return cabecalhoOriginal.call(this, nome, valor);
    };

    XHR.prototype.send = function (corpo) {
      try {
        if (pareceFeed(this.__acervo?.url)) {
          // O corpo tem de ser lido AQUI: e o unico ponto em que ele existe.
          // Sem ele nao ha doc_id, e a consulta nao pode ser repetida.
          const texto = textoDeCorpoCru(corpo);
          this.addEventListener("load", () => {
            try {
              guardar({
                url: this.__acervo.url,
                metodo: this.__acervo.metodo,
                headers: this.__acervo.headers,
                corpo: texto,
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
