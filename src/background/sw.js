import { criarRoteador } from "./roteador.js";

const roteador = criarRoteador(chrome);

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  roteador
    .aoReceberMensagem(mensagem, remetente)
    .then(responder)
    .catch((erro) => {
      // Sem este catch, uma rejeição nunca chama responder e quem perguntou
      // fica esperando para sempre — foi assim que o modal deixou de abrir.
      console.error("[Acervo] erro ao tratar", mensagem?.tipo, erro);
      responder({ erro: String(erro?.message ?? erro) });
    });
  return true; // mantém o canal aberto para a resposta assíncrona
});

chrome.action.onClicked.addListener(() => {
  roteador.abrirAcervo().catch((erro) => {
    console.error("[Acervo] erro ao abrir a aba:", erro);
  });
});
