import { ORDENACOES } from "../core/selection.js";
import { cssDoModal } from "./modal.css.js";

export const ID_MODAL = "acervo-modal-hospedeiro";

const ROTULO_ORDENACAO = {
  sequencia: "Sequência do perfil",
  curtidas: "Mais curtidas",
  views: "Mais visualizações",
  recentes: "Mais recentes",
  antigos: "Mais antigas",
};
const ORDENACOES_DE_RELEVANCIA = new Set(["curtidas", "views"]);
const ROTULO_FILTRO = { ambos: "Fotos e vídeos", fotos: "Só fotos", videos: "Só vídeos" };
const ROTULO_MODO = { faixa: "Por faixa", manual: "Marcar uma a uma", tudo: "Tudo" };

const numero = (n) => new Intl.NumberFormat("pt-BR").format(n);

export function estadoInicial() {
  return {
    filtro: "ambos",
    incluirCapaReel: false,
    modo: "faixa",
    de: 1,
    ate: 100,
    ordenacao: "sequencia",
    pularBaixados: true,
  };
}

/** Ordenar por relevância exige as métricas de TODOS os posts. */
export function podeOrdenarPorRelevancia(catalogo) {
  return Boolean(catalogo?.completo && catalogo.totalIndexado > 0);
}

export function rotuloDoBotao(estado, catalogo, marcadas = 0) {
  if (estado.modo === "tudo") return `Baixar tudo (${numero(catalogo?.totalIndexado ?? 0)})`;
  if (estado.modo === "manual") {
    return marcadas > 0 ? `Baixar ${numero(marcadas)} marcadas` : "Nenhuma publicação marcada";
  }
  return `Baixar publicações ${estado.de}–${estado.ate}`;
}

function aoTeclar(evento) {
  if (evento.key === "Escape") fecharModal();
}

export function fecharModal() {
  document.getElementById(ID_MODAL)?.remove();
  document.removeEventListener("keydown", aoTeclar);
}

export async function abrirModal({
  adaptador, handle, profileKey,
  carregarCatalogo, aoConfirmar, aoIndexar, aoAbrirAcervo,
}) {
  fecharModal();

  const catalogo = (await carregarCatalogo(profileKey)) ?? { totalIndexado: 0, completo: false };
  const estado = estadoInicial();
  const relevanciaLiberada = podeOrdenarPorRelevancia(catalogo);

  const hospedeiro = document.createElement("div");
  hospedeiro.id = ID_MODAL;
  hospedeiro.dataset.plataforma = adaptador.id;
  const sombra = hospedeiro.attachShadow({ mode: "open" });

  const estilo = document.createElement("style");
  estilo.textContent = cssDoModal(adaptador.id);

  const opcao = (grupo, valor, rotulo, marcado) => `
    <label>
      <input type="radio" name="${grupo}" value="${valor}" ${marcado ? "checked" : ""} />
      <span>${rotulo}</span>
    </label>`;

  const painel = document.createElement("div");
  painel.className = "fundo";
  painel.innerHTML = `
    <div class="painel" role="dialog" aria-modal="true" aria-label="Acervo de @${handle}">
      <header>
        <div>
          <h1>Acervo</h1>
          <p class="perfil">@${handle}</p>
        </div>
        <button class="fechar" type="button" aria-label="Fechar">×</button>
      </header>

      <p class="catalogo">
        ${numero(catalogo.totalIndexado)} publicações no catálogo${
          catalogo.completo ? "" : ", ainda incompleto"
        }
      </p>

      <section>
        <h2>Tipo de mídia</h2>
        <div class="opcoes">
          ${["ambos", "fotos", "videos"]
            .map((v) => opcao("filtro", v, ROTULO_FILTRO[v], v === estado.filtro))
            .join("")}
        </div>
        <label class="linha">
          <input type="checkbox" name="incluirCapaReel" />
          <span>Incluir a capa junto com cada vídeo</span>
        </label>
      </section>

      <section>
        <h2>O que baixar</h2>
        <div class="opcoes">
          ${["faixa", "manual", "tudo"]
            .map((v) => opcao("modo", v, ROTULO_MODO[v], v === estado.modo))
            .join("")}
        </div>

        <div class="campos-faixa-grupo">
          <div class="regua" aria-hidden="true">
            <span class="regua-inicio">1</span>
            <div class="regua-trilho"><div class="regua-banda"></div></div>
            <span class="regua-fim">${numero(catalogo.totalIndexado)}</span>
          </div>
          <div class="campos-faixa">
            <label>Da <input type="number" name="de" min="1" value="${estado.de}" /></label>
            <label>até <input type="number" name="ate" min="1" value="${estado.ate}" /></label>
          </div>
        </div>
      </section>

      <section>
        <h2>Ordenar por</h2>
        <select name="ordenacao">
          ${ORDENACOES.map(
            (v) => `<option value="${v}" ${
              ORDENACOES_DE_RELEVANCIA.has(v) && !relevanciaLiberada ? "disabled" : ""
            }>${ROTULO_ORDENACAO[v]}</option>`,
          ).join("")}
        </select>
        ${
          relevanciaLiberada
            ? ""
            : `<p class="aviso">Para ordenar por curtidas ou visualizações é preciso
                 indexar o perfil inteiro antes — as métricas não aparecem na grade.</p>`
        }
        <label class="linha">
          <input type="checkbox" name="pularBaixados" checked />
          <span>Pular o que já foi baixado</span>
        </label>
      </section>

      <footer>
        <button class="confirmar" type="button"></button>
        <div class="secundarios">
          <button class="indexar" type="button">Indexar perfil inteiro</button>
          <button class="abrir-acervo" type="button">Abrir Acervo completo</button>
        </div>
      </footer>
    </div>
  `;

  sombra.append(estilo, painel);
  document.body.append(hospedeiro);

  const $ = (sel) => sombra.querySelector(sel);
  const confirmar = $(".confirmar");
  const camposFaixa = $(".campos-faixa");
  const grupoFaixa = $(".campos-faixa-grupo");
  const banda = $(".regua-banda");

  /**
   * A régua traduz "do 500 ao 1000" para o que a pessoa está de fato pensando:
   * uma janela dentro do total. Dois campos numéricos soltos não mostram isso.
   */
  const desenharRegua = () => {
    const total = Math.max(1, catalogo.totalIndexado);
    const inicio = Math.max(1, Math.min(estado.de, estado.ate));
    const fim = Math.min(total, Math.max(estado.de, estado.ate));

    const esquerda = ((inicio - 1) / total) * 100;
    const largura = Math.max(0, ((fim - inicio + 1) / total) * 100);

    banda.style.left = `${esquerda}%`;
    banda.style.width = `${largura}%`;
  };

  const redesenhar = () => {
    const ehFaixa = estado.modo === "faixa";
    camposFaixa.hidden = !ehFaixa;
    grupoFaixa.hidden = !ehFaixa;
    confirmar.textContent = rotuloDoBotao(estado, catalogo);
    desenharRegua();
  };

  painel.addEventListener("change", (evento) => {
    const alvo = evento.target;
    if (alvo.name === "filtro" || alvo.name === "modo") estado[alvo.name] = alvo.value;
    else if (alvo.name === "ordenacao") estado.ordenacao = alvo.value;
    else if (alvo.type === "checkbox") estado[alvo.name] = alvo.checked;
    redesenhar();
  });

  painel.addEventListener("input", (evento) => {
    const alvo = evento.target;
    if (alvo.name === "de" || alvo.name === "ate") {
      estado[alvo.name] = Math.max(1, Number(alvo.value) || 1);
      redesenhar();
    }
  });

  $(".fechar").addEventListener("click", fecharModal);
  $(".indexar").addEventListener("click", () => aoIndexar({ profileKey, adaptador, handle }));
  $(".abrir-acervo").addEventListener("click", () => aoAbrirAcervo({ profileKey }));
  confirmar.addEventListener("click", () => aoConfirmar({ ...estado, profileKey, handle }));
  document.addEventListener("keydown", aoTeclar);

  redesenhar();
  return hospedeiro;
}
