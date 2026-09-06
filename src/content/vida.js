/**
 * Sobrevivência do content script quando a extensão é recarregada.
 *
 * Ao recarregar ou atualizar a extensão, os content scripts já injetados
 * continuam rodando na página, mas o `chrome.runtime` deles morre junto com a
 * versão antiga. Qualquer chamada passa a lançar "Extension context
 * invalidated".
 *
 * Isso não é um erro a se consertar: é um estado a se reconhecer. O certo é
 * perceber e sumir, em vez de deixar na tela um botão que parece funcional e
 * não faz nada.
 */

/**
 * A extensão foi recarregada e esta cópia ficou para trás.
 *
 * Vale ter nome próprio porque o sintoma engana: sem `chrome.runtime`, as
 * requisições do content script morrem em "Failed to fetch", que parece
 * problema de rede e manda procurar a causa no lugar errado. O carimbo de
 * versão saindo como "?" é o mesmo sintoma, pela mesma causa.
 */
export class ErroDeExtensaoMorta extends Error {
  constructor() {
    super(
      "A extensão foi recarregada e esta página ficou com a cópia antiga. " +
      "Recarregue a página (F5) e tente de novo.",
    );
    this.name = "ErroDeExtensaoMorta";
    this.recuperavel = false;
  }
}

/** O `id` some quando o contexto é invalidado. É o sinal mais confiável. */
export function extensaoViva(api) {
  try {
    return Boolean(api?.runtime?.id);
  } catch {
    return false;
  }
}

const MORTE = /Extension context invalidated|context invalidated/i;

/**
 * Envia mensagens enquanto a extensão viver, e avisa uma única vez quando ela
 * morrer. Nunca lança: quem chama está no meio de um clique do usuário.
 *
 * @param {typeof chrome} api
 * @param {() => void} aoMorrer chamado uma vez, para desmontar o que está na tela
 */
export function criarMensageiro(api, aoMorrer) {
  let jaAvisou = false;

  const morreu = () => {
    if (jaAvisou) return;
    jaAvisou = true;
    aoMorrer?.();
  };

  return async function enviar(mensagem) {
    if (!extensaoViva(api)) {
      morreu();
      return null;
    }
    try {
      return await api.runtime.sendMessage(mensagem);
    } catch (erro) {
      // Só a morte do contexto desmonta a interface. "Receiving end does not
      // exist" é outra coisa: o service worker estava dormindo, e isso passa.
      if (MORTE.test(String(erro?.message ?? erro))) morreu();
      return null;
    }
  };
}
