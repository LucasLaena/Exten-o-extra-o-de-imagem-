/**
 * Identidade visual do Acervo, compartilhada pelo botão e pelo modal.
 *
 * A ideia: o Instagram e o TikTok são barulhentos — gradiente, canto redondo,
 * magenta e ciano. Se a extensão imitar isso, some no fundo. Então o Acervo é
 * um instrumento de arquivo pousado em cima da página: verdete de cobre
 * oxidado sobre osso, quieto e denso em números.
 *
 * A plataforma não muda a identidade, só acrescenta um filete na cor dela.
 * Assim o usuário sabe onde está sem que a ferramenta se dissolva no site.
 */
export const TOKENS = `
  --acervo-verdete: #2F6B5E;
  --acervo-verdete-forte: #245349;
  --acervo-tinta: #1C3038;
  --acervo-grafite: #5F726F;
  --acervo-osso: #F2EFE6;
  --acervo-papel: #FFFFFF;
  --acervo-linha: #DCD8CB;
  --acervo-alerta: #B5451B;

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
