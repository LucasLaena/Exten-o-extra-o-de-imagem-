import { dormir, esperaAleatoria, ehStatusDeBloqueio } from "../core/queue.js";
import {
  IG_APP_ID,
  capturaInstalada,
  buscarJson,
  lerPerfilDaPagina,
  sondarInstagram,
  rolarAteOFim,
  drenarCapturas,
} from "./sondas.js";

export const ESPERA_MIN_MS = 800;
export const ESPERA_MAX_MS = 2000;
export const ROLAGENS_SEM_NOVIDADE = 4;
export const POR_PAGINA = 12;

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
   * Descobre o id do perfil. Lê a página primeiro, que não custa requisição
   * nenhuma; a API é plano B porque devolve 429 com muita facilidade.
   */
  async function identificarPerfil(abaId, handle) {
    const daPagina = await executor.rodar(abaId, lerPerfilDaPagina, [handle]);
    if (daPagina?.ok) return { ok: true, userId: daPagina.userId, total: null, privado: false };

    const daApi = await executor.rodar(abaId, sondarInstagram, [handle, IG_APP_ID]);
    if (daApi?.ok) return daApi;

    if (daApi?.status === 429) {
      throw new ErroDeColeta(
        "O Instagram está limitando as consultas agora (429). Espere alguns minutos " +
        "e tente de novo. Dica: deixe a aba do perfil aberta e role a grade antes de " +
        "indexar — assim o Acervo lê o id direto da página, sem consultar nada.",
      );
    }
    throw new ErroDeColeta(
      `Não consegui identificar o perfil @${handle} ` +
      `(o Instagram respondeu ${daApi?.status ?? "nada"}). ` +
      "Confira se o perfil existe e se você está logado nessa aba.",
    );
  }

  /** Instagram: pagina direto pelo endpoint de feed, de dentro da aba. */
  async function coletarInstagram({ abaId, adaptador, handle, profileKey, estado, teto, sinal }) {
    // O que a página já carregou entra sem custo nenhum de rede.
    const jaCarregado = (await executor.rodar(abaId, drenarCapturas)) ?? [];
    for (const captura of jaCarregado) {
      const pagina = adaptador.parsear(captura.json);
      const novos = preparar(pagina.itens, estado, profileKey);
      if (novos.length > 0) {
        estado.paginas++;
        await gravar(novos, estado, profileKey);
      }
    }

    const perfil = await identificarPerfil(abaId, handle);

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

      const resposta = await executor.rodar(abaId, buscarJson, [
        url,
        { headers: { "x-ig-app-id": IG_APP_ID, "x-requested-with": "XMLHttpRequest" } },
      ]);

      if (ehStatusDeBloqueio(resposta?.status)) {
        throw new ErroDeColeta(
          `O Instagram bloqueou a consulta (${resposta.status}). ` +
          "Espere alguns minutos antes de tentar de novo. O que já foi catalogado está salvo.",
        );
      }
      if (!resposta?.ok) {
        throw new ErroDeColeta(
          `O feed respondeu ${resposta?.status ?? 0}` +
          (resposta?.erro ? `: ${resposta.erro}` : "") + ".",
        );
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

      await gravar(novos, estado, profileKey, {
        userId: perfil.userId,
        cursor: maxId,
        totalDeclarado: perfil.total ?? null,
      });

      if (estado.completo || (teto != null && estado.indexados >= teto)) break;
      await esperar(esperaAleatoria(ESPERA_MIN_MS, ESPERA_MAX_MS, aleatorio), sinal);
    }
  }

  /** TikTok: rola a página e recolhe o que o próprio app carregou. */
  async function coletarTikTok({ abaId, adaptador, profileKey, estado, teto, sinal }) {
    let semNovidade = 0;

    while (semNovidade < rolagensSemNovidade) {
      if (sinal?.aborted) break;

      await executor.rodar(abaId, rolarAteOFim);
      await esperar(esperaAleatoria(ESPERA_MIN_MS, ESPERA_MAX_MS, aleatorio), sinal);

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

      semNovidade = novosNestaRodada > 0 ? 0 : semNovidade + 1;

      if (acabou) {
        estado.completo = true;
        break;
      }
      if (teto != null && estado.indexados >= teto) break;
    }

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
      const temCaptura = await executor.rodar(aba.abaId, capturaInstalada);
      if (!temCaptura) {
        throw new ErroDeColeta(
          "A extensão ainda não está ativa nessa página. Recarregue a aba do perfil " +
          "com F5 e tente de novo. (Isso acontece quando a aba foi aberta antes de " +
          "a extensão ser instalada ou recarregada.)",
        );
      }

      if (adaptador.id === "instagram") {
        await coletarInstagram({ abaId: aba.abaId, adaptador, handle, profileKey, estado, teto, sinal });
      } else {
        await coletarTikTok({ abaId: aba.abaId, adaptador, profileKey, estado, teto, sinal });
      }
    } finally {
      await executor.fecharSeCriada(aba);
    }

    return {
      indexados: estado.indexados,
      paginas: estado.paginas,
      completo: estado.completo,
    };
  }

  return { coletar };
}
