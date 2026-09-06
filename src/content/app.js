import { adaptadorDaUrl, chaveDePerfil } from "../adapters/index.js";
import { ehDestaque, idDoDestaque } from "../adapters/destaques.js";
import { montarBotao, desmontarBotao } from "./button.js";
import { abrirModal, fecharModal } from "./modal.js";
import { coletarNaPagina } from "./coleta.js";
import { criarMensageiro, extensaoViva } from "./vida.js";

export const INTERVALO_SONDAGEM_MS = 400;

/**
 * Avisa sempre que a URL muda.
 *
 * As duas plataformas são SPA e trocam de página sem recarregar. O detalhe que
 * quebra a abordagem óbvia: o content script roda no mundo ISOLADO, e embrulhar
 * `history.pushState` aqui NÃO intercepta a chamada que o app faz no mundo
 * MAIN — são objetos diferentes. Por isso a sondagem periódica não é um extra,
 * é o mecanismo principal. O resto são atalhos para reagir mais rápido.
 */
export function observarNavegacao(aoMudar) {
  let ultima = null;

  const avisar = () => {
    const atual = window.location.href;
    if (atual === ultima) return;
    ultima = atual;
    aoMudar(atual);
  };

  // Mecanismo principal: compara a URL de tempos em tempos. Custa quase nada e
  // pega qualquer forma de navegação, venha de onde vier.
  const sondagem = setInterval(avisar, INTERVALO_SONDAGEM_MS);

  // Atalhos, para não esperar até 400 ms quando dá para saber na hora.
  window.addEventListener("popstate", avisar);
  window.addEventListener("hashchange", avisar);
  const navegacao = typeof navigation !== "undefined" ? navigation : null;
  navegacao?.addEventListener?.("navigatesuccess", avisar);

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

  avisar();

  return () => {
    clearInterval(sondagem);
    window.removeEventListener("popstate", avisar);
    window.removeEventListener("hashchange", avisar);
    navegacao?.removeEventListener?.("navigatesuccess", avisar);
    history.pushState = pushOriginal;
    history.replaceState = replaceOriginal;
  };
}

/**
 * O content script faz uma coisa só: mostrar o botão e abrir o Acervo já com o
 * perfil certo. Toda a coleta acontece na aba do Acervo, que executa código
 * aqui dentro via chrome.scripting — sem a cadeia de mensagens que falhava em
 * silêncio.
 */
export function iniciar() {
  let pararDeObservar = null;

  /**
   * A extensão foi recarregada e este script ficou órfão. Sair de cena é o
   * certo: um botão que parece funcional e não faz nada é pior que nenhum.
   */
  let desmontado = false;
  const desmontar = () => {
    if (desmontado) return;
    desmontado = true;
    pararDeObservar?.();
    fecharModal();
    desmontarBotao();
    console.info(
      "[Acervo] a extensão foi recarregada; recarregue esta página (F5) para usar de novo.",
    );
  };

  const enviar = criarMensageiro(chrome, desmontar);

  pararDeObservar = observarNavegacao((url) => {
    // Esperar um clique para notar a morte deixaria o botão na tela por tempo
    // indefinido. A sondagem de navegação já roda; verificar aqui é de graça.
    if (!extensaoViva(chrome)) {
      desmontar();
      return;
    }

    // Dentro de um destaque não há faixa nem ordenação para escolher: a
    // coleção é pequena e fechada, e o botão baixa ela inteira.
    if (ehDestaque(url)) {
      fecharModal();
      montarBotao({
        adaptador: { id: "instagram", rotulo: "Instagram" },
        handle: "este destaque",
        rotulo: "Baixar destaque",
        aoClicar: () =>
          enviar({
            tipo: "abrirAcervo",
            perfil: idDoDestaque(url),
            acao: "destaque",
            pedido: { destaque: idDoDestaque(url), urlDoDestaque: url },
          }),
      });
      return;
    }

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
          carregarCatalogo: (chave) => enviar({ tipo: "catalogo", profileKey: chave }),
          aoIndexar: (pedido) =>
            enviar({
              tipo: "abrirAcervo",
              perfil: pedido.profileKey,
              acao: "indexar",
              pedido,
            }),
          aoAbrirAcervo: (args) =>
            enviar({ tipo: "abrirAcervo", perfil: args.profileKey }),
          // A coleta acontece AQUI, nesta pagina. Nada de mandar o usuario
          // para outra aba: e de dentro do proprio site que a requisicao
          // passa e que a rolagem funciona.
          aoConfirmar: async (pedido) => {
            const r = await coletarNaPagina({
              adaptador,
              handle,
              profileKey,
              teto: Number(pedido.ate) || null,
              aoProgresso: pedido.aoProgresso,
            });

            // O que a coleta juntou vive na memoria DESTA aba. O Acervo tem
            // banco proprio e nao alcanca isto: sem a passagem, catalogar
            // dava certo e a grade continuava vazia.
            pedido.aoProgresso?.({ aviso: "Guardando o catálogo…" });
            await enviar({
              tipo: "guardarPosts",
              profileKey,
              posts: r.posts,
              total: r.total,
              completo: r.completo,
            });

            // Abrir sozinho: ate aqui era preciso clicar de novo para ver o
            // que acabou de ser catalogado.
            await enviar({ tipo: "abrirAcervo", perfil: profileKey, pedido });
            return r;
          },
        }),
    });
  });
}
