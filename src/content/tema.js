/**
 * Identidade visual do Acervo, compartilhada pelo botão e pelo modal.
 *
 * O Instagram e o TikTok são barulhentos — gradiente, canto redondo, magenta e
 * ciano. Se a extensão imitar isso, some no fundo. Então o Acervo é um
 * instrumento de arquivo pousado em cima da página: bancada escura, latão e
 * números alinhados. Quieto do lado de fora, denso por dentro.
 *
 * A mesma paleta da aba do Acervo, de propósito: quem cataloga aqui e vê o
 * resultado lá não deve ter a impressão de trocar de programa no meio.
 *
 * A plataforma não muda a identidade, só acrescenta um filete na cor dela.
 * Assim o usuário sabe onde está sem que a ferramenta se dissolva no site.
 */
export const TOKENS = `
  --acervo-superficie: #171A1E;
  --acervo-papel: #20252B;
  --acervo-fundo-alto: #272D34;
  --acervo-linha: #2B323A;
  --acervo-linha-forte: #3A434D;

  --acervo-tinta: #E9ECEF;
  --acervo-grafite: #939BA5;
  --acervo-apagado: #6B737D;

  /* Latão: identidade de arquivo, e a única cor que quer dizer "aja aqui". */
  --acervo-latao: #C8A344;
  --acervo-latao-forte: #E3BE5C;
  --acervo-latao-escuro: #1A1508;

  /* Água: só estado e andamento. Nunca ação — o olho aprende a diferença. */
  --acervo-agua: #48C4BC;
  --acervo-alerta: #E4575C;

  --acervo-texto: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --acervo-numeros: 13px/1.4 ui-monospace, "Cascadia Mono", "SF Mono", Menlo, monospace;
`;

/** Só o filete muda por plataforma. O resto do Acervo é sempre o mesmo. */
export const FILETE = {
  instagram: "#C13584",
  tiktok: "#00C4CC",
};

/** Movimento só responde a ação da pessoa, e some se ela pediu menos movimento. */
export const MOVIMENTO_REDUZIDO = `
  @media (prefers-reduced-motion: reduce) {
    * { animation: none !important; transition: none !important; }
  }
`;
