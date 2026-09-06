import { criarAprendiz } from "../acervo/assinatura-aba.js";
import { criarColetorDireto } from "../acervo/direto.js";
import { extrairIdDoPerfil } from "../core/perfil-html.js";
import { extrairTotal } from "../core/total-do-perfil.js";
import { criarCanalDaPagina } from "./canal-da-pagina.js";
import { extensaoViva, ErroDeExtensaoMorta } from "./vida.js";

/**
 * Um catálogo que vive só enquanto a página estiver aberta.
 *
 * Foi o pedido: ao sair, o que foi coletado se perde. Aqui isso sai de graça —
 * fechar a aba leva tudo junto, sem banco nenhum para limpar.
 */
export function catalogoNaMemoria() {
  const posts = [];
  let perfil = {};

  return {
    posts: {
      async salvarLote(lote) { posts.push(...lote); },
      todos: () => posts,
    },
    perfis: {
      async salvar(p) { perfil = { ...perfil, ...p }; },
      async obter() { return perfil; },
    },
  };
}

/**
 * Cataloga sem sair da página do perfil.
 *
 * Toda a dificuldade das versões anteriores vinha de tentar fazer isto de
 * fora: a requisição saía de outra origem e era barrada, e a aba de segundo
 * plano não era renderizada, então nunca rolava e nunca via a consulta que
 * precisava aprender. Aqui dentro os dois problemas simplesmente não existem.
 *
 * @param {{ adaptador: object, handle: string, profileKey: string,
 *           teto?: number|null, sinal?: AbortSignal, aoProgresso?: Function,
 *           canal?: object, documento?: Document, esperar?: Function }} args
 */
export async function coletarNaPagina({
  adaptador,
  handle,
  profileKey,
  teto = null,
  sinal,
  aoProgresso,
  canal = criarCanalDaPagina(),
  documento = document,
  // Injetavel para o teste nao pagar as pausas de verdade entre paginas.
  esperar,
  api = globalThis.chrome,
}) {
  // Falhar aqui, com instrucao, e melhor do que falhar tres passos adiante
  // com "Failed to fetch", que nao diz o que fazer.
  if (!extensaoViva(api)) throw new ErroDeExtensaoMorta();

  const html = documento?.documentElement?.innerHTML ?? "";
  const idDoDono = extrairIdDoPerfil(html, handle);
  const total = extrairTotal(html, documento?.body?.innerText ?? "");

  aoProgresso?.({ etapa: "lendo", idDoDono, total });

  // A página só consulta o feed quando a grade é alcançada, então o aprendiz
  // vai precisar cutucar. É o único momento em que algo rola.
  const { assinatura, pagina } = await criarAprendiz(
    esperar ? { esperar } : {},
  ).aprender({
    canal,
    idDoDono,
    adaptador,
    aoProgresso,
    sinal,
  });

  aoProgresso?.({ etapa: "aprendida", assinatura });

  const repo = catalogoNaMemoria();
  const resultado = await criarColetorDireto({
    repo,
    buscar: canal.buscar,
    aoProgresso,
    ...(esperar ? { esperar } : {}),
  }).coletarComAssinatura({
    adaptador,
    assinatura,
    paginaInicial: pagina,
    profileKey,
    total,
    teto,
    sinal,
  });

  return { ...resultado, posts: repo.posts.todos(), idDoDono };
}
