import { TOKENS, FILETE, MOVIMENTO_REDUZIDO } from "./tema.js";

export const ID_HOSPEDEIRO = "acervo-botao-hospedeiro";

export function desmontarBotao() {
  document.getElementById(ID_HOSPEDEIRO)?.remove();
}

/**
 * O botão vive num Shadow DOM. O CSS do Instagram e do TikTok é agressivo e
 * muda toda semana; sem a sombra, o botão herdaria estilo aleatório e sumiria.
 */
export function montarBotao({ adaptador, handle, aoClicar, rotulo = "Acervo" }) {
  desmontarBotao();

  const hospedeiro = document.createElement("div");
  hospedeiro.id = ID_HOSPEDEIRO;
  hospedeiro.dataset.plataforma = adaptador.id;

  const sombra = hospedeiro.attachShadow({ mode: "open" });

  const estilo = document.createElement("style");
  estilo.textContent = `
    :host { all: initial; ${TOKENS} }

    .caixa {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 2147483000;
      font: var(--acervo-texto);
      color: var(--acervo-tinta);
    }

    button {
      display: flex;
      align-items: baseline;
      gap: 10px;
      padding: 11px 18px 11px 14px;
      border: 1px solid var(--acervo-verdete-forte);
      border-left: 4px solid ${FILETE[adaptador.id] ?? FILETE.instagram};
      border-radius: 3px;
      background: var(--acervo-verdete);
      color: var(--acervo-osso);
      font: inherit;
      font-weight: 600;
      letter-spacing: .01em;
      cursor: pointer;
      box-shadow: 0 2px 0 var(--acervo-verdete-forte);
      transition: transform .1s ease, box-shadow .1s ease;
    }

    /* O botão afunda quando pressionado: o movimento responde à ação, não decora. */
    button:active {
      transform: translateY(2px);
      box-shadow: 0 0 0 var(--acervo-verdete-forte);
    }

    button:focus-visible {
      outline: 2px solid var(--acervo-tinta);
      outline-offset: 3px;
    }

    .arroba {
      font: var(--acervo-numeros);
      opacity: .82;
    }

    ${MOVIMENTO_REDUZIDO}
  `;

  const caixa = document.createElement("div");
  caixa.className = "caixa";

  const botao = document.createElement("button");
  botao.type = "button";
  botao.setAttribute("aria-label", `${rotulo}: ${handle}`);

  const nome = document.createElement("span");
  nome.textContent = rotulo;
  const arroba = document.createElement("span");
  arroba.className = "arroba";
  arroba.textContent = `@${handle}`;

  botao.append(nome, arroba);
  botao.addEventListener("click", aoClicar);

  caixa.append(botao);
  sombra.append(estilo, caixa);
  document.body.append(hospedeiro);

  return hospedeiro;
}
