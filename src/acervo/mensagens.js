const numero = (n) => new Intl.NumberFormat("pt-BR").format(n ?? 0);

/**
 * O que a tela do Acervo deve dizer agora.
 *
 * Uma grade vazia sem explicação é o pior estado possível: a pessoa não tem
 * como saber se falta clicar em algo, se deu erro, ou se o perfil não tem
 * publicação. Cada caso de vazio aqui vira uma instrução do que fazer.
 *
 * @param {{ total: number, baixados: number, temAssinatura: boolean,
 *           temAba: boolean }} args
 */
export function estadoDaTela({ total, baixados, temAssinatura, temAba }) {
  const resumo =
    `${numero(total)} publicações no catálogo · ${numero(baixados)} já baixadas`;

  if (total > 0) {
    return { resumo, vazio: null, podeIndexar: true };
  }

  if (!temAba) {
    return {
      resumo,
      podeIndexar: false,
      vazio: {
        titulo: "Abra o perfil numa aba",
        passos: [
          "Volte para a aba do Instagram ou do TikTok e abra o perfil que você quer.",
          "Clique no botão Acervo, no canto inferior direito da página.",
        ],
        porque:
          "O Acervo indexa a partir da aba do perfil aberta, porque é de lá que " +
          "as requisições saem com a sua sessão.",
      },
    };
  }

  if (!temAssinatura) {
    return {
      resumo,
      podeIndexar: false,
      vazio: {
        titulo: "Ainda não vi o feed deste perfil",
        passos: [
          "Volte para a aba do perfil e recarregue a página (F5).",
          "Role a grade de publicações por alguns segundos.",
          "Volte aqui e clique em Indexar perfil.",
        ],
        porque:
          "Não existe campo de URL aqui de propósito: esta aba não consegue " +
          "buscar o feed sozinha. Quem busca é um script dentro da própria " +
          "página do Instagram, usando a sua sessão já logada. Por isso o " +
          "Acervo precisa ver o feed carregar pelo menos uma vez.",
      },
    };
  }

  return {
    resumo,
    podeIndexar: true,
    vazio: {
      titulo: "Catálogo vazio",
      passos: [
        "Abra o perfil numa aba e role a grade por alguns segundos — é isso que faz a plataforma carregar os dados.",
        "Volte aqui e clique em Indexar perfil.",
        "Num perfil grande isso leva alguns minutos, e fica salvo para sempre.",
      ],
      porque:
        "Ordenar por curtidas ou visualizações só funciona com o catálogo " +
        "completo: a grade do perfil não mostra essas métricas.",
    },
  };
}
