import { TOKENS, FILETE, MOVIMENTO_REDUZIDO } from "./tema.js";

/**
 * O modal é um instrumento de arquivo, não um cartão de app: bancada
 * escura, filetes finos como estrutura entre grupos do formulário, e uma única
 * peça ousada — a régua da faixa.
 *
 * Mesma paleta da aba do Acervo, de propósito. Catalogar aqui e ver o
 * resultado lá não pode dar a impressão de trocar de programa no meio.
 */
export function cssDoModal(plataforma) {
  return `
    :host { all: initial; ${TOKENS} }

    .fundo {
      position: fixed;
      inset: 0;
      z-index: 2147483001;
      display: grid;
      place-items: center;
      background: rgba(6, 8, 10, .72);
      font: var(--acervo-texto);
      color: var(--acervo-tinta);
    }

    .painel {
      position: relative;
      width: min(480px, calc(100vw - 32px));
      max-height: calc(100vh - 48px);
      overflow-y: auto;
      background: var(--acervo-superficie);
      border: 1px solid var(--acervo-linha-forte);
      border-top: 4px solid ${FILETE[plataforma] ?? FILETE.instagram};
      border-radius: 2px;
      box-shadow: 0 24px 48px rgba(28, 48, 56, .28);
      animation: entrar .14s ease-out;
    }

    .painel::before {
      content: "";
      position: absolute;
      inset: -10px;
      z-index: -1;
      border-radius: 6px;
      background: conic-gradient(
        from 210deg,
        var(--acervo-latao),
        ${FILETE[plataforma] ?? FILETE.instagram},
        var(--acervo-agua),
        var(--acervo-latao)
      );
      filter: blur(16px);
      opacity: .3;
      animation: respirar 5.5s ease-in-out infinite;
    }

    @keyframes respirar {
      0%, 100% { opacity: .18; }
      50% { opacity: .46; }
    }

    @keyframes entrar {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: none; }
    }

    header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 20px 14px;
    }

    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 650;
      letter-spacing: -.01em;
    }

    .perfil {
      margin: 2px 0 0;
      font: var(--acervo-numeros);
      color: var(--acervo-grafite);
    }

    .fechar {
      flex: none;
      width: 28px;
      height: 28px;
      border: 1px solid var(--acervo-linha);
      border-radius: 2px;
      background: transparent;
      color: var(--acervo-grafite);
      font: inherit;
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
    }
    .fechar:hover { border-color: var(--acervo-tinta); color: var(--acervo-tinta); }

    .catalogo {
      margin: 0;
      padding: 0 20px 16px;
      font: var(--acervo-numeros);
      color: var(--acervo-grafite);
    }

    section {
      padding: 16px 20px;
      border-top: 1px solid var(--acervo-linha);
    }

    h2 {
      margin: 0 0 10px;
      font-size: 13px;
      font-weight: 650;
      color: var(--acervo-grafite);
    }

    .opcoes {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .opcoes label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 11px;
      border: 1px solid var(--acervo-linha);
      border-radius: 2px;
      background: var(--acervo-papel);
      cursor: pointer;
      font-size: 13px;
    }

    .opcoes label:has(input:checked) {
      border-color: var(--acervo-latao);
      background: var(--acervo-latao);
      color: var(--acervo-latao-escuro);
    }

    .opcoes label:focus-within {
      outline: 2px solid var(--acervo-tinta);
      outline-offset: 2px;
    }

    .linha {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
      font-size: 13px;
      cursor: pointer;
    }

    /* --- os dois caminhos ------------------------------------------------- */

    .caminhos {
      display: grid;
      gap: 8px;
      padding: 16px 20px;
      border-top: 1px solid var(--acervo-linha);
    }

    .caminho {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 2px 10px;
      padding: 12px 14px;
      border: 1px solid var(--acervo-linha);
      border-radius: 2px;
      background: var(--acervo-papel);
      cursor: pointer;
    }

    .caminho:has(input:checked) {
      border-color: var(--acervo-latao);
      box-shadow: inset 0 0 0 1px var(--acervo-latao);
    }

    .caminho input { grid-row: 1 / span 3; align-self: start; margin-top: 3px; }

    .caminho-titulo { font-weight: 650; }

    .caminho-detalhe {
      font-size: 13px;
      color: var(--acervo-grafite);
      line-height: 1.45;
    }

    .caminho-custo {
      margin-top: 4px;
      font: var(--acervo-numeros);
      font-size: 12px;
      color: var(--acervo-alerta);
    }

    .caminho-custo[data-bom="1"] { color: var(--acervo-latao-forte); }

    /* --- a régua: a única peça ousada do painel --------------------------- */

    .regua {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 10px;
      margin: 16px 0 10px;
      font: var(--acervo-numeros);
      color: var(--acervo-grafite);
    }

    .regua-trilho {
      position: relative;
      height: 22px;
      border: 1px solid var(--acervo-linha);
      border-radius: 2px;
      background:
        repeating-linear-gradient(
          to right,
          var(--acervo-linha) 0 1px,
          transparent 1px 10%
        ),
        var(--acervo-papel);
    }

    .regua-banda {
      position: absolute;
      top: -1px;
      bottom: -1px;
      background: var(--acervo-latao);
      border: 1px solid var(--acervo-latao-forte);
      border-radius: 2px;
      transition: left .12s ease, width .12s ease;
    }

    .campos-faixa {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
    }

    .campos-faixa input {
      width: 88px;
      padding: 7px 9px;
      border: 1px solid var(--acervo-linha);
      border-radius: 2px;
      background: var(--acervo-papel);
      font: var(--acervo-numeros);
      color: var(--acervo-tinta);
    }
    .campos-faixa input:focus-visible {
      outline: 2px solid var(--acervo-latao);
      outline-offset: 1px;
    }

    select {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid var(--acervo-linha);
      border-radius: 2px;
      background: var(--acervo-papel);
      font: inherit;
      color: var(--acervo-tinta);
    }

    .aviso {
      margin: 10px 0 0;
      padding-left: 10px;
      border-left: 2px solid var(--acervo-alerta);
      font-size: 13px;
      color: var(--acervo-grafite);
    }

    .andamento {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--acervo-grafite);
}

footer {
      padding: 16px 20px 20px;
      border-top: 1px solid var(--acervo-linha);
    }

    .confirmar {
      width: 100%;
      padding: 13px;
      border: 1px solid var(--acervo-latao-forte);
      border-radius: 2px;
      background: var(--acervo-latao);
      color: var(--acervo-latao-escuro);
      font: inherit;
      font-weight: 650;
      cursor: pointer;
      box-shadow: 0 2px 0 var(--acervo-latao-forte);
      transition: transform .1s ease, box-shadow .1s ease;
    }
    .confirmar:active {
      transform: translateY(2px);
      box-shadow: 0 0 0 var(--acervo-latao-forte);
    }
    .confirmar:focus-visible {
      outline: 2px solid var(--acervo-tinta);
      outline-offset: 3px;
    }

    .secundarios {
      display: flex;
      gap: 16px;
      margin-top: 12px;
    }

    .secundarios button {
      padding: 0;
      border: 0;
      background: none;
      font: inherit;
      font-size: 13px;
      color: var(--acervo-latao-forte);
      text-decoration: underline;
      text-underline-offset: 3px;
      cursor: pointer;
    }
    .secundarios button:focus-visible {
      outline: 2px solid var(--acervo-tinta);
      outline-offset: 2px;
    }

    ${MOVIMENTO_REDUZIDO}
  `;
}
