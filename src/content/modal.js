import { ORDENACOES } from "../core/selection.js";
import { extrairTotal, estimarTempo } from "../core/total-do-perfil.js";
import { cssDoModal } from "./modal.css.js";

export const ID_MODAL = "acervo-modal-hospedeiro";
export const TEMPO_LIMITE_CATALOGO = 4000;

const ROTULO_ORDENACAO = {
  sequencia: "Sequência do perfil",
  curtidas: "Mais curtidas",
  views: "Mais visualizações",
  recentes: "Mais recentes",
  antigos: "Mais antigas",
};
const ORDENACOES_DE_RELEVANCIA = new Set(["curtidas", "views"]);
const ROTULO_FILTRO = { ambos: "Fotos e vídeos", fotos: "Só fotos", videos: "Só vídeos" };

const numero = (n) => new Intl.NumberFormat("pt-BR").format(n ?? 0);

export function estadoInicial() {
  return {
    filtro: "ambos",
    incluirCapaReel: false,
    modo: "faixa",
    de: 1,
    ate: 100,
    ordenacao: "sequencia",
    pularBaixados: false,
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

/**
 * Lê o catálogo sem nunca travar a abertura do modal. Um modal que espera para
 * sempre é indistinguível de um botão quebrado.
 */
async function lerCatalogo(carregarCatalogo, profileKey, tempoLimite) {
  const desconhecido = { totalIndexado: 0, completo: false, desconhecido: true };
  const estouro = new Promise((r) => setTimeout(() => r(desconhecido), tempoLimite));
  try {
    return (await Promise.race([carregarCatalogo(profileKey), estouro])) ?? desconhecido;
  } catch {
    return desconhecido;
  }
}

function aoTeclar(evento) {
  if (evento.key === "Escape") fecharModal();
}

export function fecharModal() {
  document.getElementById(ID_MODAL)?.remove();
  document.removeEventListener("keydown", aoTeclar);
}

/**
 * O modal escolhe entre dois caminhos de custo muito diferente:
 *
 * - **Faixa**: busca só as N primeiras na ordem do perfil. Segundos.
 * - **Filtros**: cataloga o perfil inteiro para poder ordenar por relevância.
 *   Minutos, e é a única forma de saber qual é a mais vista.
 *
 * Mostrar o custo de cada um antes da escolha é o ponto: sem isso a pessoa
 * escolhe às cegas entre cinco segundos e cinco minutos.
 */
export async function abrirModal({
  adaptador, handle, profileKey,
  carregarCatalogo, aoConfirmar, aoIndexar, aoAbrirAcervo,
  tempoLimiteCatalogo = TEMPO_LIMITE_CATALOGO,
}) {
  fecharModal();

  const catalogo = await lerCatalogo(carregarCatalogo, profileKey, tempoLimiteCatalogo);
  const estado = estadoInicial();

  // O total sai da própria página: é o que permite dizer o custo de catalogar.
  const totalDoPerfil = extrairTotal(
    document.documentElement?.innerHTML ?? "",
    document.body?.innerText ?? "",
  );
  const jaCatalogado = catalogo.completo && catalogo.totalIndexado > 0;

  const hospedeiro = document.createElement("div");
  hospedeiro.id = ID_MODAL;
  hospedeiro.dataset.plataforma = adaptador.id;
  const sombra = hospedeiro.attachShadow({ mode: "open" });

  const estilo = document.createElement("style");
  estilo.textContent = cssDoModal(adaptador.id);

  const custoFiltros = jaCatalogado
    ? `${numero(catalogo.totalIndexado)} já catalogadas — pronto para usar`
    : totalDoPerfil
      ? `catalogar ${numero(totalDoPerfil)} publicações, ${estimarTempo(totalDoPerfil)}`
      : "cataloga o perfil inteiro primeiro";

  const painel = document.createElement("div");
  painel.className = "fundo";
  painel.innerHTML = `
    <div class="painel" role="dialog" aria-modal="true" aria-label="Acervo de @${handle}">
      <header>
        <div>
          <h1>Acervo</h1>
          <p class="perfil">@${handle}${
            totalDoPerfil ? ` · ${numero(totalDoPerfil)} publicações` : ""
          }</p>
        </div>
        <button class="fechar" type="button" aria-label="Fechar">×</button>
      </header>

      <div class="caminhos" role="radiogroup" aria-label="Como escolher o que baixar">
        <label class="caminho">
          <input type="radio" name="caminho" value="faixa" checked />
          <span class="caminho-titulo">Por faixa</span>
          <span class="caminho-detalhe">
            Da publicação X à Y, na ordem do perfil. Busca só o que você pediu.
          </span>
          <span class="caminho-custo" data-bom="1">buscar 100, poucos segundos</span>
        </label>

        <label class="caminho">
          <input type="radio" name="caminho" value="filtros" />
          <span class="caminho-titulo">Por filtros</span>
          <span class="caminho-detalhe">
            Ordenar por mais curtidas, mais vistas ou data, e escolher na grade.
          </span>
          <span class="caminho-custo" data-bom="${jaCatalogado ? "1" : "0"}">${custoFiltros}</span>
        </label>
      </div>

      <section class="secao-faixa">
        <h2>Quais publicações</h2>
        <div class="regua" aria-hidden="true">
          <span class="regua-inicio">1</span>
          <div class="regua-trilho"><div class="regua-banda"></div></div>
          <span class="regua-fim">${numero(totalDoPerfil ?? catalogo.totalIndexado)}</span>
        </div>
        <div class="campos-faixa">
          <label>Da <input type="number" name="de" min="1" value="${estado.de}" /></label>
          <label>até <input type="number" name="ate" min="1" value="${estado.ate}" /></label>
        </div>
      </section>

      <section class="secao-filtros" hidden>
        <h2>Ordenar por</h2>
        <select name="ordenacao">
          ${ORDENACOES.map(
            (v) => `<option value="${v}">${ROTULO_ORDENACAO[v]}</option>`,
          ).join("")}
        </select>
        <p class="aviso" ${jaCatalogado ? "hidden" : ""}>
          Para ordenar por relevância é preciso catalogar o perfil inteiro antes —
          as curtidas e visualizações não aparecem na grade.
        </p>
      </section>

      <section>
        <h2>Tipo de mídia</h2>
        <div class="opcoes">
          ${["ambos", "fotos", "videos"].map((v) => `
            <label>
              <input type="radio" name="filtro" value="${v}" ${
                v === estado.filtro ? "checked" : ""
              } />
              <span>${ROTULO_FILTRO[v]}</span>
            </label>`).join("")}
        </div>
        <label class="linha">
          <input type="checkbox" name="incluirCapaReel" />
          <span>Incluir a capa junto com cada vídeo</span>
        </label>
      </section>

      <footer>
        <button class="confirmar" type="button"></button>
        <div class="secundarios">
          <button class="abrir-acervo" type="button">Abrir Acervo completo</button>
        </div>
      </footer>
    </div>
  `;

  sombra.append(estilo, painel);
  document.body.append(hospedeiro);

  const $ = (sel) => sombra.querySelector(sel);
  const confirmar = $(".confirmar");
  const banda = $(".regua-banda");
  let caminho = "faixa";

  /** A régua traduz a faixa para o que a pessoa está pensando: uma janela. */
  const desenharRegua = () => {
    const total = Math.max(1, totalDoPerfil ?? catalogo.totalIndexado ?? 1);
    const inicio = Math.max(1, Math.min(estado.de, estado.ate));
    const fim = Math.min(total, Math.max(estado.de, estado.ate));
    banda.style.left = `${((inicio - 1) / total) * 100}%`;
    banda.style.width = `${Math.max(0, ((fim - inicio + 1) / total) * 100)}%`;
  };

  const redesenhar = () => {
    const ehFaixa = caminho === "faixa";
    $(".secao-faixa").hidden = !ehFaixa;
    $(".secao-filtros").hidden = ehFaixa;

    if (ehFaixa) {
      const quantas = Math.abs(estado.ate - estado.de) + 1;
      $(".caminho-custo").textContent =
        `buscar ${numero(quantas)}, ${estimarTempo(quantas)}`;
      confirmar.textContent = `Baixar publicações ${estado.de}–${estado.ate}`;
    } else {
      confirmar.textContent = jaCatalogado
        ? "Abrir o Acervo para escolher"
        : "Catalogar o perfil e abrir o Acervo";
    }
    desenharRegua();
  };

  painel.addEventListener("change", (evento) => {
    const alvo = evento.target;
    if (alvo.name === "caminho") caminho = alvo.value;
    else if (alvo.name === "filtro") estado.filtro = alvo.value;
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
  $(".abrir-acervo").addEventListener("click", () => aoAbrirAcervo({ profileKey }));

  confirmar.addEventListener("click", () => {
    const pedido = { ...estado, profileKey, handle, caminho };

    if (caminho === "faixa") {
      // Ordem do perfil e faixa fechada: dá para buscar só o pedido, sem
      // varrer as 2.000 publicações do perfil.
      aoConfirmar({ ...pedido, ordenacao: "sequencia", modo: "faixa", escopo: "faixa" });
    } else {
      aoIndexar({ ...pedido, modo: "faixa", escopo: "tudo" });
    }
    fecharModal();
  });

  document.addEventListener("keydown", aoTeclar);
  redesenhar();
  return hospedeiro;
}
