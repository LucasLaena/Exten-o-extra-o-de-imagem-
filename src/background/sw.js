import { criarRoteador } from "./roteador.js";

const roteador = criarRoteador(chrome);

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  roteador.aoReceberMensagem(mensagem, remetente).then(responder);
  return true; // mantém o canal aberto para a resposta assíncrona
});

chrome.action.onClicked.addListener(() => {
  roteador.abrirAcervo();
});
