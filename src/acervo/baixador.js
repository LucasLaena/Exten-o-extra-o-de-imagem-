import { particionar, TAMANHO_PADRAO_PARTE } from "../core/partition.js";
import {
  montarNome,
  larguraSeq,
  criarResolvedorDeColisao,
  TEMPLATE_PADRAO,
} from "../core/naming.js";
import { pipelineOrdenado } from "../core/queue.js";
import { escreverZip } from "../core/zipper.js";
import { csvDoAcervo, relatorioJson } from "../core/csv.js";
import { pastaDoArquivo, caminhoNoZip } from "../core/pastas.js";

export const CONCORRENCIA_PADRAO = 4;

/**
 * @param {{ adaptador: any, buscarMidia: Function, abrirDestino: Function,
 *           escreverTexto: Function, repo: any, aoProgresso?: Function }} deps
 */
export function criarBaixador({
  adaptador, buscarMidia, abrirDestino, escreverTexto, repo, aoProgresso,
}) {
  /** Expande os posts de uma parte na lista de arquivos a baixar, já batizados. */
  function planejarParte(parte, { posicoes, opcoes, perfil, template, largura }) {
    // Um resolvedor por pasta: dois arquivos de mesmo nome em pastas
    // diferentes não colidem, e numerar como se colidissem seria confuso.
    const resolvedores = new Map();
    const entradas = [];

    for (const post of parte.posts) {
      const posicao = posicoes.get(post.key);

      for (const { midia, ehCapa } of adaptador.midiasParaBaixar(post, opcoes)) {
        const pasta = pastaDoArquivo({ post, midia, ehCapa, posicao, largura });

        if (!resolvedores.has(pasta)) resolvedores.set(pasta, criarResolvedorDeColisao());
        const nome = resolvedores.get(pasta)(
          montarNome({ post, midia, posicao, perfil, largura, template, ehCapa }),
        );

        entradas.push({
          postKey: post.key,
          post,
          midia,
          ehCapa,
          nome,
          pasta,
          caminho: caminhoNoZip(pasta, nome),
          posicao,
        });
      }
    }
    return entradas;
  }

  /** Baixa e emite para o zip, anotando falhas sem derrubar o lote. */
  async function* fluxoDaParte(entradas, estado, concorrencia, sinal) {
    const pipeline = pipelineOrdenado(
      entradas,
      (entrada) => buscarMidia(entrada.midia.url, sinal),
      { concorrencia, sinal },
    );

    for await (const resultado of pipeline) {
      const entrada = entradas[resultado.indice];

      if (resultado.erro) {
        estado.falhas.push({
          postKey: entrada.postKey,
          url: entrada.midia.url,
          motivo: String(resultado.erro.message ?? resultado.erro),
        });
        estado.postsComFalha.add(entrada.postKey);
        continue;
      }

      estado.arquivosPorPost.get(entrada.postKey).push(entrada.caminho);
      estado.arquivos++;
      aoProgresso?.({ tipo: "arquivo", nome: entrada.caminho, arquivos: estado.arquivos });

      yield { nome: entrada.caminho, entrada: resultado.valor };
    }
  }

  async function baixar({
    jobId,
    perfil,
    profileKey,
    posts,
    posicoes,
    opcoes,
    template = TEMPLATE_PADRAO,
    tamanhoParte = TAMANHO_PADRAO_PARTE,
    concorrencia = CONCORRENCIA_PADRAO,
    sinal,
  }) {
    const partes = particionar(posts, posicoes, tamanhoParte);
    if (partes.length === 0) {
      return { partes: [], falhas: [], baixados: [], arquivos: 0 };
    }

    const largura = larguraSeq(Math.max(...posts.map((p) => posicoes.get(p.key) ?? 0)));
    const estado = {
      falhas: [],
      postsComFalha: new Set(),
      arquivosPorPost: new Map(posts.map((p) => [p.key, []])),
      arquivos: 0,
    };
    const resumoPartes = [];
    const baixados = [];

    for (const parte of partes) {
      const entradas = planejarParte(parte, { posicoes, opcoes, perfil, template, largura });
      const destino = await abrirDestino(parte.nome);

      const resultado = await escreverZip({
        itens: fluxoDaParte(entradas, estado, concorrencia, sinal),
        destino,
        sinal,
      });

      // Só marca o post que saiu inteiro. Marcar pela metade faria "pular já
      // baixados" esconder um post incompleto para sempre.
      const completos = parte.posts.filter(
        (p) => !estado.postsComFalha.has(p.key) && estado.arquivosPorPost.get(p.key).length > 0,
      );
      const registros = completos.map((p) => ({
        key: p.key,
        profileKey,
        jobId,
        arquivos: estado.arquivosPorPost.get(p.key),
      }));
      await repo.baixados.marcar(registros);
      baixados.push(...registros);

      resumoPartes.push({
        n: parte.n,
        nome: parte.nome,
        posts: parte.posts.length,
        arquivos: resultado.arquivos,
        bytes: resultado.bytes,
      });
      aoProgresso?.({ tipo: "parte", n: parte.n, de: partes.length, nome: parte.nome });
    }

    // Escritos no fim, com o resultado real e não com a intenção.
    const registrosCsv = posts
      .filter((p) => estado.arquivosPorPost.get(p.key).length > 0)
      .map((p) => ({
        post: p,
        posicao: posicoes.get(p.key),
        arquivos: estado.arquivosPorPost.get(p.key),
      }));

    await escreverTexto("acervo.csv", csvDoAcervo(registrosCsv));
    await escreverTexto(
      "relatorio.json",
      relatorioJson({
        perfil: profileKey,
        ordenacao: opcoes.ordenacao ?? null,
        filtro: opcoes.filtro,
        partes: resumoPartes,
        falhas: estado.falhas,
        comMarcaDagua: posts.filter((p) => p.comMarcaDagua).map((p) => p.key),
      }),
    );

    await repo.jobs.salvar({
      jobId,
      profileKey,
      status: "concluido",
      partes: resumoPartes,
      concluidoEm: Date.now(),
    });

    return {
      partes: resumoPartes,
      falhas: estado.falhas,
      baixados,
      arquivos: estado.arquivos,
    };
  }

  return { baixar };
}
