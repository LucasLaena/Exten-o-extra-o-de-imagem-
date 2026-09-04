//
// Roda no mundo MAIN da página, como SCRIPT CLÁSSICO. Não pode usar import.
// Por isso os padrões abaixo são uma cópia literal de PADROES_DE_FEED em
// src/core/assinatura.js — o teste test/dom/hook.test.js falha se divergirem.
//
// Papel: observar o tráfego que o app já faz e, sob comando, disparar a
// paginação a partir desta origem. Não modifica nada do que o app pede.

(function instalarHookDoAcervo() {
  if (window.__acervo_hook__?.instalado) return;

  const PADROES = [
    /\/graphql\/query/,
    /\/api\/v1\/feed\/user\//,
    /\/api\/post\/item_list/,
  ];

  const FONTE_HOOK = "acervo/pagina";
  const FONTE_CONTEUDO = "acervo/conteudo";

  const fetchOriginal = window.fetch.bind(window);
  const pareceFeed = (url) => typeof url === "string" && PADROES.some((p) => p.test(url));

  const avisar = (mensagem) => {
    try {
      window.postMessage({ fonte: FONTE_HOOK, ...mensagem }, "*");
    } catch {
      // postMessage pode falhar com objeto não clonável; nunca vale quebrar a página
    }
  };

  function headersComoObjeto(headers) {
    const saida = {};
    if (!headers) return saida;
    if (typeof Headers !== "undefined" && headers instanceof Headers) {
      headers.forEach((valor, nome) => { saida[nome.toLowerCase()] = valor; });
      return saida;
    }
    if (Array.isArray(headers)) {
      for (const [nome, valor] of headers) saida[String(nome).toLowerCase()] = valor;
      return saida;
    }
    for (const [nome, valor] of Object.entries(headers)) {
      saida[String(nome).toLowerCase()] = valor;
    }
    return saida;
  }

  /** Extrai url, método, headers e corpo tanto de fetch(url, init) quanto de fetch(Request). */
  function descreverRequest(entrada, init) {
    if (typeof Request !== "undefined" && entrada instanceof Request) {
      return {
        url: entrada.url,
        metodo: entrada.method,
        headers: headersComoObjeto(entrada.headers),
        corpo: init?.body != null ? String(init.body) : null,
      };
    }
    return {
      url: String(entrada),
      metodo: init?.method ?? "GET",
      headers: headersComoObjeto(init?.headers),
      corpo: init?.body != null ? String(init.body) : null,
    };
  }

  window.fetch = async function fetchDoAcervo(entrada, init) {
    const resposta = await fetchOriginal(entrada, init);

    // Tudo daqui pra baixo é observação. Se der errado, o app não pode sentir.
    try {
      const descricao = descreverRequest(entrada, init);
      if (pareceFeed(descricao.url)) {
        // clone(): consumir o corpo original deixaria o app sem dados.
        resposta
          .clone()
          .json()
          .then((json) => avisar({ tipo: "capturou", carga: { ...descricao, json } }))
          .catch(() => {});
      }
    } catch {
      // ignorado de propósito
    }

    return resposta;
  };

  // XHR ainda aparece em rotas antigas do Instagram.
  const XHROriginal = window.XMLHttpRequest;
  if (XHROriginal) {
    const abrirOriginal = XHROriginal.prototype.open;
    const enviarOriginal = XHROriginal.prototype.send;

    XHROriginal.prototype.open = function (metodo, url, ...resto) {
      this.__acervo = { metodo, url: String(url) };
      return abrirOriginal.call(this, metodo, url, ...resto);
    };

    XHROriginal.prototype.send = function (corpo) {
      try {
        if (pareceFeed(this.__acervo?.url)) {
          this.addEventListener("load", () => {
            try {
              avisar({
                tipo: "capturou",
                carga: {
                  url: this.__acervo.url,
                  metodo: this.__acervo.metodo,
                  headers: {},
                  corpo: corpo != null ? String(corpo) : null,
                  json: JSON.parse(this.responseText),
                },
              });
            } catch {}
          });
        }
      } catch {}
      return enviarOriginal.call(this, corpo);
    };
  }

  // Paginação sob comando do content script.
  window.addEventListener("message", async (evento) => {
    const dados = evento.data;
    // Recusa mensagem vinda de outro frame. Em navegador, source é sempre a
    // janela que postou; null só acontece em ambiente de teste, e aceitá-lo
    // não abre brecha nenhuma em produção.
    if (evento.source && evento.source !== window) return;
    if (dados?.fonte !== FONTE_CONTEUDO || dados?.tipo !== "paginar") return;

    try {
      const resposta = await fetchOriginal(dados.url, {
        ...dados.init,
        credentials: "include",
      });
      const texto = await resposta.text();
      let json = null;
      try {
        json = JSON.parse(texto);
      } catch {}

      avisar({
        tipo: "pagina",
        id: dados.id,
        ok: resposta.ok && json !== null,
        status: resposta.status,
        json,
      });
    } catch (erro) {
      avisar({
        tipo: "pagina",
        id: dados.id,
        ok: false,
        status: 0,
        erro: String(erro?.message ?? erro),
      });
    }
  });

  window.__acervo_hook__ = { instalado: true, fetchOriginal };
})();
