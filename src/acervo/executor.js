import { dormir } from "../core/queue.js";

/**
 * Falha ao falar com a aba do perfil. Tem mensagem em português dizendo o que
 * fazer, porque é o erro que o usuário mais vai encontrar.
 */
export class ErroDeAba extends Error {
  constructor(mensagem, causa) {
    super(mensagem);
    this.name = "ErroDeAba";
    this.causa = causa;
  }
}

const ESPERA_ENTRE_CHECAGENS_MS = 300;
const TENTATIVAS_DE_CARGA = 40; // ~12s

/** Compara URLs de perfil ignorando query string e barra final. */
function mesmoPerfil(a, b) {
  const limpar = (u) => {
    try {
      const url = new URL(u);
      return (url.origin + url.pathname).replace(/\/+$/, "").toLowerCase();
    } catch {
      return String(u).toLowerCase();
    }
  };
  return limpar(a) === limpar(b);
}

function traduzirErro(erro) {
  const texto = String(erro?.message ?? erro);

  if (/No tab with id|No tab with ID/i.test(texto)) {
    return new ErroDeAba(
      "A aba do perfil foi fechada durante a operação. Abra o perfil de novo e tente outra vez.",
      erro,
    );
  }
  if (/Cannot access|Extension manifest must request permission|blocked/i.test(texto)) {
    return new ErroDeAba(
      "Não consegui rodar na aba do perfil. Recarregue a extensão em chrome://extensions " +
      "e recarregue a aba do perfil com F5.",
      erro,
    );
  }
  if (/frame was removed|Frame with ID/i.test(texto)) {
    return new ErroDeAba(
      "A aba do perfil recarregou no meio da operação. Tente de novo.",
      erro,
    );
  }
  return new ErroDeAba(`Falha ao falar com a aba do perfil: ${texto}`, erro);
}

/**
 * Executa código dentro da aba do perfil e recebe o resultado na mesma
 * chamada. É o que substitui a cadeia hook → content script → service worker
 * → aba, em que cada salto podia morrer em silêncio.
 *
 * @param {typeof chrome} api
 */
export function criarExecutor(api, opcoes = {}) {
  const {
    esperar = dormir,
    tentativasDeCarga = TENTATIVAS_DE_CARGA,
    esperaEntreChecagens = ESPERA_ENTRE_CHECAGENS_MS,
  } = opcoes;

  /**
   * @param {number} abaId
   * @param {Function} func Serializada e executada na outra aba. Não pode
   *   fechar sobre nada do escopo daqui: tudo vem por `args`.
   */
  async function rodar(abaId, func, args = []) {
    let resultados;
    try {
      resultados = await api.scripting.executeScript({
        target: { tabId: abaId },
        world: "MAIN",
        func,
        args,
      });
    } catch (erro) {
      throw traduzirErro(erro);
    }

    if (!Array.isArray(resultados) || resultados.length === 0) {
      throw new ErroDeAba("A aba do perfil respondeu sem resultado. Recarregue-a com F5.");
    }
    return resultados[0]?.result;
  }

  async function esperarCarregar(abaId) {
    for (let i = 0; i < tentativasDeCarga; i++) {
      const aba = await api.tabs.get(abaId);
      if (aba?.status === "complete") return;
      await esperar(esperaEntreChecagens);
    }
    throw new ErroDeAba(
      "A aba do perfil não terminou de carregar. Verifique sua conexão e tente de novo.",
    );
  }

  /** Acha a aba do perfil aberta, ou abre uma em segundo plano. */
  async function acharOuAbrirAba(urlDoPerfil) {
    const abertas = await api.tabs.query({ url: ["*://*.instagram.com/*", "*://*.tiktok.com/*"] });
    const existente = abertas.find((a) => mesmoPerfil(a.url, urlDoPerfil));
    if (existente) return { abaId: existente.id, criada: false };

    const nova = await api.tabs.create({ url: urlDoPerfil, active: false });
    await esperarCarregar(nova.id);
    return { abaId: nova.id, criada: true };
  }

  /** Fecha só o que este executor abriu; a aba do usuário fica onde está. */
  async function fecharSeCriada(aba) {
    if (!aba?.criada) return;
    try {
      await api.tabs.remove(aba.abaId);
    } catch {
      // já fechada: nada a fazer
    }
  }

  return { rodar, acharOuAbrirAba, fecharSeCriada, esperarCarregar };
}
