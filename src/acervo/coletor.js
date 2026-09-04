import { dormir, esperaAleatoria, ehStatusDeBloqueio } from "../core/queue.js";
import {
  IG_APP_ID,
  capturaInstalada,
  buscarJson,
  lerPerfilDaPagina,
  lerTotalDaPagina,
  sondarInstagram,
  rolarUmPouco,
  drenarCapturas,
} from "./sondas.js";

export const ESPERA_MIN_MS = 800;
export const ESPERA_MAX_MS = 2000;
export const ROLAGENS_SEM_NOVIDADE = 8;
/** Quantos empurrões por ida e volta, e a pausa entre eles, dentro da página. */
export const PASSOS_POR_RODADA = 5;
export const PAUSA_ENTRE_PASSOS_MS = 900;
/** Teto absoluto de rolagens. Página que cresce sem parar não pode girar para sempre. */
export const MAX_ROLAGENS = 500;
export const POR_PAGINA = 50;
/** Quantas vezes insistir numa pagina antes de desistir da API. */
export const TENTATIVAS_POR_PAGINA = 3;

/** Erro com texto pronto para a tela. */
export class ErroDeColeta extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroDeColeta";
  }
}

/**
 * Coleta o catálogo de um perfil executando código DENTRO da aba dele.
 *
 * Substitui a cadeia antiga (hook → content script → service worker → aba e
 * de volta), em que cada salto podia falhar em silêncio. Aqui cada passo é uma
 * chamada com retorno: ou vem o dado, ou vem um erro com nome.
 */
export function criarColetor({
  executor,
  repo,
  aoProgresso,
  esperar = dormir,
  aleatorio = Math.random,
  rolagensSemNovidade = ROLAGENS_SEM_NOVIDADE,
  maxRolagens = MAX_ROLAGENS,
  passosPorRodada = PASSOS_POR_RODADA,
  pausaEntrePassos = PAUSA_ENTRE_PASSOS_MS,
  rolarSeFaltar = true,
}) {
  /** Acumula os posts de uma página, atribuindo seq e chave. Ignora repetidos. */
  function preparar(brutos, estado, profileKey) {
    const novos = [];
    for (const bruto of brutos) {
      const key = `${profileKey}#${bruto.id}`;
      if (estado.vistos.has(key)) continue;
      estado.vistos.add(key);
      novos.push({ ...bruto, key, profileKey, seq: ++estado.seq });
    }
    return novos;
  }

  async function gravar(novos, estado, profileKey, extra = {}) {
    if (novos.length > 0) await repo.posts.salvarLote(novos);
    estado.indexados += novos.length;
    await repo.perfis.salvar({
      key: profileKey,
      totalIndexado: estado.seq,
      completo: estado.completo,
      indexadoEm: Date.now(),
      ...extra,
    });
    aoProgresso?.({ indexados: estado.indexados, paginas: estado.paginas, ...extra });
  }

  /**
   * Descobre o id do perfil, do mais barato para o mais arriscado:
   *
   * 1. do próprio feed já capturado — mesma fonte que vamos paginar;
   * 2. do HTML da página, se o formato conhecido estiver lá;
   * 3. da API, que é a única que custa requisição e devolve 429 fácil.
   */
  async function identificarPerfil(abaId, handle, idDasCapturas, jaColhidos) {
    if (idDasCapturas) {
      return { ok: true, userId: idDasCapturas, total: null, privado: false, fonte: "captura" };
    }

    const daPagina = await executor.rodar(abaId, lerPerfilDaPagina, [handle]);
    if (daPagina?.ok) {
      return { ok: true, userId: daPagina.userId, total: null, privado: false, fonte: "pagina" };
    }

    const daApi = await executor.rodar(abaId, sondarInstagram, [handle, IG_APP_ID]);
    if (daApi?.ok) return { ...daApi, fonte: "api" };

    // O que já entrou está salvo; dizer isso muda o tom do erro por completo.
    const salvo = jaColhidos > 0
      ? ` As ${jaColhidos} publicações que a página já tinha carregado ficaram salvas.`
      : "";

    if (daApi?.status === 429) {
      throw new ErroDeColeta(
        "O Instagram está limitando as consultas agora (429)." + salvo +
        " Espere uns 15 minutos. Dica: abra a aba do perfil, role a grade até carregar " +
        "várias publicações, e só então clique em Indexar — assim o Acervo pega tudo " +
        "do que a página carregou, sem consultar a API.",
      );
    }
    throw new ErroDeColeta(
      `Não consegui identificar o perfil @${handle} ` +
      `(o Instagram respondeu ${daApi?.status ?? "nada"}).` + salvo +
      " Confira se o perfil existe e se você está logado nessa aba.",
    );
  }

  /** Instagram: pagina direto pelo endpoint de feed, de dentro da aba. */
  async function coletarInstagram({ abaId, adaptador, handle, profileKey, estado, teto, sinal }) {
    // O que a página já carregou entra sem custo nenhum de rede — e é dele
    // que sai o id do dono, a fonte mais confiável que existe para esse dado.
    const jaCarregado = (await executor.rodar(abaId, drenarCapturas)) ?? [];
    let idDasCapturas = null;

    for (const captura of jaCarregado) {
      idDasCapturas ??= adaptador.idDoDono?.(captura.json) ?? null;
      const pagina = adaptador.parsear(captura.json);
      const novos = preparar(pagina.itens, estado, profileKey);
      if (novos.length > 0) {
        estado.paginas++;
        await gravar(novos, estado, profileKey);
      }
    }

    let perfil;
    try {
      perfil = await identificarPerfil(abaId, handle, idDasCapturas, estado.indexados);
    } catch (erro) {
      // Sem id não dá para paginar pela API, mas dá para rolar a página.
      estado.recuouParaRolagem = true;
      aoProgresso?.({
        indexados: estado.indexados,
        paginas: estado.paginas,
        aviso: erro.message + " Continuando pela rolagem da página.",
      });
      return { recuar: true };
    }

    if (perfil.privado) {
      throw new ErroDeColeta(
        `O perfil @${handle} é privado. O Acervo só cataloga o que a sua conta já pode ver.`,
      );
    }

    let maxId = null;
    let paginasSemNovidade = 0;

    while (true) {
      if (sinal?.aborted) break;

      const url =
        `https://www.instagram.com/api/v1/feed/user/${perfil.userId}/` +
        `?count=${POR_PAGINA}${maxId ? `&max_id=${encodeURIComponent(maxId)}` : ""}`;

      // Uma negativa isolada nao pode encerrar a coleta: o Instagram
      // responde 429 esporadico e volta ao normal em segundos.
      let resposta = null;
      for (let tentativa = 1; tentativa <= TENTATIVAS_POR_PAGINA; tentativa++) {
        if (sinal?.aborted) break;

        resposta = await executor.rodar(abaId, buscarJson, [
          url,
          { headers: { "x-ig-app-id": IG_APP_ID, "x-requested-with": "XMLHttpRequest" } },
        ]);
        if (resposta?.ok) break;

        if (tentativa < TENTATIVAS_POR_PAGINA) {
          aoProgresso?.({
            indexados: estado.indexados,
            paginas: estado.paginas,
            total: estado.totalDeclarado,
            aviso:
              `O Instagram respondeu ${resposta?.status ?? 0}. ` +
              `Tentando de novo (${tentativa} de ${TENTATIVAS_POR_PAGINA - 1})…`,
          });
          await esperar(3000 * tentativa, sinal);
        }
      }

      if (!resposta?.ok) {
        estado.recuouParaRolagem = true;
        aoProgresso?.({
          indexados: estado.indexados,
          paginas: estado.paginas,
          total: estado.totalDeclarado,
          aviso:
            `O Instagram limitou a consulta (${resposta?.status ?? 0}). ` +
            "Continuando pela rolagem da página, que é mais lenta.",
        });
        return { recuar: true };
      }

      const pagina = adaptador.parsear(resposta.json);
      estado.paginas++;

      const novos = preparar(pagina.itens, estado, profileKey);
      maxId = pagina.cursor ?? maxId;
      estado.completo = !pagina.temMais || pagina.itens.length === 0;

      // Cursor travado devolve a mesma página para sempre. Sem esta guarda o
      // laço nunca termina, porque a deduplicação impede indexados de crescer.
      paginasSemNovidade = novos.length > 0 ? 0 : paginasSemNovidade + 1;
      if (paginasSemNovidade >= 2) estado.completo = true;

      estado.totalDeclarado ??= perfil.total ?? null;
      await gravar(novos, estado, profileKey, {
        userId: perfil.userId,
        cursor: maxId,
        totalDeclarado: estado.totalDeclarado,
      });

      if (estado.completo || (teto != null && estado.indexados >= teto)) break;
      await esperar(esperaAleatoria(ESPERA_MIN_MS, ESPERA_MAX_MS, aleatorio), sinal);
    }

    return { recuar: false };
  }

  /**
   * Rola a página e recolhe o que o próprio app carrega.
   *
   * É a estratégia do TikTok e o plano de recuo do Instagram: não faz
   * requisição nenhuma por conta própria, então atravessa rate-limit. É mais
   * lenta e exige a aba aberta, mas funciona quando a API fecha a porta.
   */
  async function coletarRolando({ abaId, adaptador, profileKey, estado, teto, sinal }) {
    let semNovidade = 0;
    let alturaAnterior = 0;
    let rodadas = 0;

    // Sem foco o Instagram não carrega mais nada: o IntersectionObserver que
    // dispara a paginação infinita não roda em aba de segundo plano.
    const abaAnterior = await executor.ativar?.(abaId);
    aoProgresso?.({
      indexados: estado.indexados,
      paginas: estado.paginas,
      total: estado.totalDeclarado,
      aviso: "Trouxe a aba do perfil para frente: ela precisa estar visível para carregar mais.",
    });

    try {

    while (semNovidade < rolagensSemNovidade && rodadas < maxRolagens) {
      if (teto != null && estado.indexados >= teto) break;
      rodadas++;
      if (sinal?.aborted) break;

      // Os empurrões e as pausas acontecem dentro da página, onde a aba está
      // ativa e o relógio não é estrangulado.
      const rolagem = await executor.rodar(abaId, rolarUmPouco, [
        passosPorRodada,
        pausaEntrePassos,
      ]);
      const altura = rolagem?.alturaDepois ?? 0;

      const capturas = (await executor.rodar(abaId, drenarCapturas)) ?? [];
      estado.paginas += capturas.length;

      let novosNestaRodada = 0;
      let acabou = false;

      for (const captura of capturas) {
        const pagina = adaptador.parsear(captura.json);
        const novos = preparar(pagina.itens, estado, profileKey);
        novosNestaRodada += novos.length;
        if (!pagina.temMais) acabou = true;
        await gravar(novos, estado, profileKey);
      }

      // A página crescendo é sinal de que ainda está carregando, mesmo sem
      // post novo nesta rodada. Sem isso a coleta desiste cedo demais.
      // Na primeira rodada não há base de comparação: crescer em relação a
      // zero não significa nada.
      const cresceu = alturaAnterior > 0 && altura > alturaAnterior;
      alturaAnterior = Math.max(alturaAnterior, altura);
      semNovidade = novosNestaRodada > 0 || cresceu ? 0 : semNovidade + 1;

      aoProgresso?.({
        indexados: estado.indexados,
        paginas: estado.paginas,
        total: estado.totalDeclarado,
        rolando: true,
        paradas: semNovidade,
        limite: rolagensSemNovidade,
      });

      if (acabou) {
        estado.completo = true;
        break;
      }
      if (teto != null && estado.indexados >= teto) break;
    }

    } finally {
      await executor.restaurar?.(abaAnterior);
    }

    // Sem post novo por várias rodadas seguidas, com a página parada de
    // crescer: é o fim do feed. Só declara completo se algo chegou a entrar.
    if (semNovidade >= rolagensSemNovidade && estado.indexados > 0) estado.completo = true;

    await repo.perfis.salvar({
      key: profileKey,
      totalIndexado: estado.seq,
      completo: estado.completo,
      indexadoEm: Date.now(),
    });
  }

  /**
   * @param {{ adaptador: object, handle: string, profileKey: string,
   *           urlDoPerfil: string, seqInicial?: number, teto?: number|null,
   *           sinal?: AbortSignal }} args
   */
  async function coletar({
    adaptador, handle, profileKey, urlDoPerfil,
    seqInicial = 0, teto = null, sinal,
  }) {
    const aba = await executor.acharOuAbrirAba(urlDoPerfil);
    const estado = {
      seq: seqInicial,
      indexados: 0,
      paginas: 0,
      completo: false,
      vistos: new Set(),
    };

    try {
      const daPagina = await executor.rodar(aba.abaId, lerTotalDaPagina);
      estado.totalDeclarado = daPagina?.total ?? null;

      const temCaptura = await executor.rodar(aba.abaId, capturaInstalada);
      if (!temCaptura) {
        throw new ErroDeColeta(
          "A extensão ainda não está ativa nessa página. Recarregue a aba do perfil " +
          "com F5 e tente de novo. (Isso acontece quando a aba foi aberta antes de " +
          "a extensão ser instalada ou recarregada.)",
        );
      }

      const argumentos = { abaId: aba.abaId, adaptador, handle, profileKey, estado, teto, sinal };

      if (adaptador.id === "instagram") {
        // A API primeiro, sempre: ela traz 50 publicações por requisição.
        // Um perfil de 2.000 sai em cerca de 40 requisições, contra dezenas
        // de minutos de rolagem para o mesmo tanto.
        const r = await coletarInstagram(argumentos);

        // A rolagem é o último recurso, não a rotina: só entra quando a API
        // não deu conta, e avisa que vai demorar.
        // Com teto atingido o pedido já está satisfeito: rolar mais seria
        // gastar minutos para buscar publicações que ninguém pediu.
        const tetoAtingido = teto != null && estado.indexados >= teto;
        const faltaGente =
          !tetoAtingido &&
          estado.totalDeclarado != null &&
          estado.indexados < estado.totalDeclarado;

        if (rolarSeFaltar && !tetoAtingido && (r?.recuar || faltaGente)) {
          const faltam = estado.totalDeclarado
            ? Math.max(0, estado.totalDeclarado - estado.indexados)
            : null;
          aoProgresso?.({
            indexados: estado.indexados,
            paginas: estado.paginas,
            total: estado.totalDeclarado,
            aviso:
              "A via rápida não deu conta. Continuando pela rolagem" +
              (faltam ? `, faltam ~${faltam}` : "") +
              " — isso é bem mais lento.",
          });
          estado.completo = false;
          await coletarRolando(argumentos);
        }
      } else {
        await coletarRolando(argumentos);
      }
    } finally {
      await executor.fecharSeCriada(aba);
    }

    return {
      indexados: estado.indexados,
      paginas: estado.paginas,
      completo: estado.completo,
      total: estado.totalDeclarado,
      recuouParaRolagem: Boolean(estado.recuouParaRolagem),
    };
  }

  return { coletar };
}
