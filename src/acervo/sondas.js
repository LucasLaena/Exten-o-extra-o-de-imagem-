/**
 * Funções que a aba do Acervo executa DENTRO da aba do perfil, via
 * chrome.scripting.executeScript com world: "MAIN".
 *
 * Regras que valem para todas:
 * - São serializadas e enviadas para a outra aba. Não podem fechar sobre
 *   nada deste módulo: tudo que precisam vem por argumento.
 * - O valor de retorno precisa ser serializável (JSON).
 * - Rodam na origem do Instagram/TikTok, com a sessão do navegador. É por
 *   isso que funcionam onde a aba do Acervo, de outra origem, não conseguiria.
 */

export const IG_APP_ID = "936619743392459";

/** Só para o diagnóstico saber que o código roda lá dentro. */
export function pingar() {
  return "ok";
}

/** A captura em document_start (src/page/captura.js) está viva nesta aba? */
export function capturaInstalada() {
  return Boolean(window.__acervo_captura__?.instalado);
}

/** Busca genérica, com a sessão da página. Nunca lança: devolve o erro. */
export async function buscarJson(url, init) {
  try {
    const resposta = await fetch(url, { ...(init ?? {}), credentials: "include" });
    const texto = await resposta.text();
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch {}
    return { ok: resposta.ok && json !== null, status: resposta.status, json };
  } catch (erro) {
    return { ok: false, status: 0, json: null, erro: String(erro?.message ?? erro) };
  }
}

/**
 * Descobre o id do perfil lendo a PRÓPRIA PÁGINA já carregada.
 *
 * Custo zero de rede, e por isso imune ao 429 que o endpoint web_profile_info
 * devolve com facilidade. Esta é a primeira tentativa; a consulta à API é o
 * plano B.
 */
export function lerPerfilDaPagina(handle) {
  const html = document.documentElement ? document.documentElement.innerHTML : "";
  const seguro = String(handle).replace(/[^A-Za-z0-9_]/g, function (c) {
    return "\\" + c;
  });

  const padroes = [
    new RegExp('"id":"(\\d+)","username":"' + seguro + '"', "i"),
    new RegExp('"username":"' + seguro + '","id":"(\\d+)"', "i"),
    new RegExp('"profilePage_(\\d+)"'),
    new RegExp('"user_id":"(\\d+)"'),
    new RegExp('"owner":\\{"id":"(\\d+)"'),
  ];

  // O total declarado é o denominador do contador: sem ele não dá para dizer
  // se a coleta terminou ou apenas travou.
  let total = null;
  const doTotal = html.match(/"edge_owner_to_timeline_media":\{"count":(\d+)/);
  if (doTotal) total = Number(doTotal[1]);

  for (const padrao of padroes) {
    const achado = html.match(padrao);
    if (achado && achado[1]) {
      return { ok: true, userId: achado[1], total: total, fonte: "pagina" };
    }
  }
  return { ok: false, total: total, fonte: "pagina" };
}

/**
 * Quantas publicações a página diz que o perfil tem.
 *
 * Serve de denominador para o contador. Vem do JSON embutido quando existe, e
 * do texto visível ("312 publicações") como último recurso.
 */
export function lerTotalDaPagina() {
  const html = document.documentElement ? document.documentElement.innerHTML : "";

  const doJson = html.match(/"edge_owner_to_timeline_media":\{"count":(\d+)/);
  if (doJson) return { total: Number(doJson[1]), fonte: "json" };

  const texto = document.body ? document.body.innerText || "" : "";
  const doTexto = texto.match(/([\d.,]+)\s+publica/i);
  if (doTexto) {
    const limpo = Number(doTexto[1].replace(/[.,]/g, ""));
    if (Number.isFinite(limpo) && limpo > 0) return { total: limpo, fonte: "texto" };
  }
  return { total: null, fonte: "nenhuma" };
}

/**
 * Identifica o perfil do Instagram pelo handle, consultando a API.
 *
 * Plano B: este endpoint é agressivamente limitado e devolve 429 com
 * facilidade. Prefira lerPerfilDaPagina.
 */
export async function sondarInstagram(handle, appId) {
  const url =
    "https://www.instagram.com/api/v1/users/web_profile_info/?username=" +
    encodeURIComponent(handle);
  try {
    const resposta = await fetch(url, {
      credentials: "include",
      headers: { "x-ig-app-id": appId, "x-requested-with": "XMLHttpRequest" },
    });
    if (!resposta.ok) return { ok: false, status: resposta.status };

    const json = await resposta.json();
    const usuario = json && json.data ? json.data.user : null;
    if (!usuario || !usuario.id) {
      return { ok: false, status: resposta.status, erro: "resposta sem data.user" };
    }
    return {
      ok: true,
      status: resposta.status,
      userId: String(usuario.id),
      handle: usuario.username || handle,
      total: usuario.edge_owner_to_timeline_media
        ? usuario.edge_owner_to_timeline_media.count
        : null,
      privado: Boolean(usuario.is_private),
    };
  } catch (erro) {
    return { ok: false, status: 0, erro: String(erro && erro.message ? erro.message : erro) };
  }
}

/**
 * Chama o endpoint de feed uma vez e relata o que voltou.
 *
 * É este endpoint que faz a coleta ser rápida: 50 publicações por requisição,
 * contra dezenas de segundos de rolagem para o mesmo tanto. Quando ele falha,
 * a coleta cai para a rolagem — então saber exatamente o que ele responde é a
 * diferença entre um minuto e meia hora.
 */
export async function sondarFeed(userId, appId, quantas) {
  const url =
    "https://www.instagram.com/api/v1/feed/user/" + userId + "/?count=" + quantas;
  try {
    const resposta = await fetch(url, {
      credentials: "include",
      headers: { "x-ig-app-id": appId, "x-requested-with": "XMLHttpRequest" },
    });

    const texto = await resposta.text();
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch {}

    if (!json) {
      return { ok: false, status: resposta.status, erro: "resposta não era JSON" };
    }
    return {
      ok: resposta.ok,
      status: resposta.status,
      itens: Array.isArray(json.items) ? json.items.length : 0,
      temMais: Boolean(json.more_available),
      temCursor: Boolean(json.next_max_id),
      mensagem: json.message || null,
    };
  } catch (erro) {
    return { ok: false, status: 0, erro: String(erro && erro.message ? erro.message : erro) };
  }
}

export const ID_AVISO = "__acervo_aviso__";

/**
 * Mostra na página do perfil que a extensão está trabalhando.
 *
 * Sem isto a página começa a rolar sozinha e a pessoa não sabe se travou, se
 * é vírus ou se é o programa. A moldura não intercepta clique: ela avisa, não
 * atrapalha.
 */
export function mostrarAviso(texto) {
  const anterior = document.getElementById(ID_AVISO);
  if (anterior) {
    const rotulo = anterior.querySelector("[data-texto]");
    if (rotulo) rotulo.textContent = texto;
    return true;
  }

  const caixa = document.createElement("div");
  caixa.id = ID_AVISO;
  caixa.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483000",
    "pointer-events:none",
    "border:3px solid #2F6B5E",
    "box-shadow:inset 0 0 0 1px rgba(242,239,230,.6), inset 0 0 60px rgba(47,107,94,.28)",
  ].join(";");

  const pilula = document.createElement("div");
  pilula.style.cssText = [
    "position:absolute",
    "left:50%",
    "top:18px",
    "transform:translateX(-50%)",
    "display:flex",
    "align-items:center",
    "gap:9px",
    "padding:9px 16px",
    "border-radius:999px",
    "background:#1C3038",
    "color:#F2EFE6",
    "font:600 13px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
    "box-shadow:0 6px 20px rgba(28,48,56,.4)",
  ].join(";");

  const ponto = document.createElement("span");
  ponto.style.cssText =
    "width:8px;height:8px;border-radius:50%;background:#2F6B5E;box-shadow:0 0 0 3px rgba(47,107,94,.35)";

  const rotulo = document.createElement("span");
  rotulo.dataset.texto = "1";
  rotulo.textContent = texto;

  const nota = document.createElement("span");
  nota.textContent = "não feche esta aba";
  nota.style.cssText = "opacity:.7;font-weight:400";

  pilula.append(ponto, rotulo, nota);
  caixa.append(pilula);
  document.body.appendChild(caixa);
  return true;
}

/** Tira a moldura. Chamado sempre, inclusive quando a coleta falha. */
export function esconderAviso() {
  document.getElementById(ID_AVISO)?.remove();
  return true;
}

/** Rola até o fim para o app buscar a próxima página. Devolve a altura nova. */
export function rolarAteOFim() {
  const altura = Math.max(
    document.documentElement.scrollHeight,
    document.body ? document.body.scrollHeight : 0,
  );
  window.scrollTo(0, altura);
  return altura;
}

/**
 * Rola várias vezes DENTRO da página, esperando entre cada uma.
 *
 * Duas razões para a espera acontecer aqui, e não do lado de quem chama:
 *
 * 1. Quem chama é a aba do Acervo, que fica em segundo plano durante a
 *    rolagem — e o Chrome estrangula setTimeout em aba escondida. Aqui o
 *    relógio é o da aba ativa, que corre normal.
 * 2. Uma rolagem por ida e volta é pouco. O Instagram precisa de vários
 *    empurrões seguidos para engatar o carregamento contínuo.
 *
 * Sobe um pouco antes de descer de novo: alguns feeds só disparam o
 * carregamento quando o sentinela reentra na tela, e ficar colado no fundo
 * nunca produz essa reentrada.
 */
export async function rolarUmPouco(passos, pausaMs) {
  const dormir = (ms) => new Promise((pronto) => setTimeout(pronto, ms));
  const alturaAtual = () =>
    Math.max(
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0,
    );

  const alturaAntes = alturaAtual();

  for (let i = 0; i < passos; i++) {
    window.scrollTo(0, alturaAtual());
    await dormir(pausaMs);

    if (i % 2 === 1) {
      window.scrollBy(0, -Math.round(window.innerHeight * 0.8));
      await dormir(Math.round(pausaMs / 3));
      window.scrollTo(0, alturaAtual());
      await dormir(Math.round(pausaMs / 3));
    }
  }

  return {
    alturaAntes,
    alturaDepois: alturaAtual(),
    y: window.scrollY,
    fimDaPagina: window.scrollY + window.innerHeight >= alturaAtual() - 200,
  };
}

/** Esvazia o buffer de capturas e devolve o que havia. */
export function drenarCapturas() {
  const fila = Array.isArray(window.__acervo_capturas__) ? window.__acervo_capturas__ : [];
  window.__acervo_capturas__ = [];
  return fila;
}
