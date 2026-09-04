import { dormir, esperaAleatoria, ehStatusDeBloqueio } from "../core/queue.js";
import {
  extrairIdDoPerfil, ehPrivado, pareceInexistente, extrairCsrf, extrairAppId,
} from "../core/perfil-html.js";
import { extrairTotal } from "../core/total-do-perfil.js";
import { IG_APP_ID } from "./sondas.js";

export const POR_PAGINA = 50;
export const ESPERA_MIN_MS = 700;
export const ESPERA_MAX_MS = 1600;
export const TENTATIVAS = 3;

/** Falha da coleta direta, com texto pronto para a tela. */
export class ErroDireto extends Error {
  constructor(mensagem, { recuperavel = true } = {}) {
    super(mensagem);
    this.name = "ErroDireto";
    // Recuperável significa: vale tentar o caminho da aba. Perfil privado ou
    // inexistente não é recuperável — abrir aba não muda nada.
    this.recuperavel = recuperavel;
  }
}

/**
 * Coleta sem abrir aba nenhuma.
 *
 * A extensão tem permissão de host para instagram.com, então a própria aba do
 * Acervo pode buscar lá, e o navegador anexa a sessão. As regras de
 * declarativeNetRequest ajustam Origin e Referer para a requisição não parecer
 * vir de lugar nenhum.
 *
 * O ganho é grande: nada de aba abrindo, nada de rolagem tomando a tela, e a
 * pessoa continua usando o computador enquanto baixa. A troco disso, só
 * funciona em perfil público ou que a conta logada já pode ver — mas isso vale
 * para qualquer caminho.
 *
 * @param {{ buscar?: typeof fetch, repo: any, aoProgresso?: Function,
 *           esperar?: Function, aleatorio?: () => number }} deps
 */
export function criarColetorDireto({
  buscar = fetch,
  repo,
  aoProgresso,
  esperar = dormir,
  aleatorio = Math.random,
}) {
  // Descobertos na primeira busca, a da página do perfil, e usados dali em
  // diante. A API recusa requisição sem o token anti-falsificação.
  let csrf = null;
  let appId = IG_APP_ID;

  function cabecalhos() {
    const headers = {
      "x-ig-app-id": appId,
      "x-requested-with": "XMLHttpRequest",
      "x-ig-www-claim": "0",
    };
    if (csrf) headers["x-csrftoken"] = csrf;
    return headers;
  }

  async function buscarTexto(url) {
    const resposta = await buscar(url, { credentials: "include", headers: cabecalhos() });
    return { status: resposta.status, ok: resposta.ok, texto: await resposta.text() };
  }

  /** Identifica o perfil pela própria página, que não sofre o 429 da API. */
  async function identificar(handle) {
    const url = `https://www.instagram.com/${encodeURIComponent(handle)}/`;

    let resposta;
    try {
      resposta = await buscarTexto(url);
    } catch (erro) {
      throw new ErroDireto(
        `Não consegui abrir o perfil sem aba: ${erro?.message ?? erro}.`,
      );
    }

    if (ehStatusDeBloqueio(resposta.status)) {
      throw new ErroDireto(
        `O Instagram limitou a consulta (${resposta.status}). Espere alguns minutos.`,
      );
    }
    if (!resposta.ok) {
      throw new ErroDireto(`O perfil respondeu ${resposta.status}.`);
    }
    if (pareceInexistente(resposta.texto)) {
      throw new ErroDireto(
        `Não achei o perfil @${handle}. Confira o endereço.`,
        { recuperavel: false },
      );
    }
    if (ehPrivado(resposta.texto)) {
      throw new ErroDireto(
        `O perfil @${handle} é privado. O Acervo só cataloga perfis públicos, ` +
        "ou privados que a conta logada neste navegador já segue.",
        { recuperavel: false },
      );
    }

    // A própria página traz o token e o app id que a API vai exigir.
    csrf = extrairCsrf(resposta.texto) ?? csrf;
    appId = extrairAppId(resposta.texto) ?? appId;

    const userId = extrairIdDoPerfil(resposta.texto, handle);
    if (!userId) {
      throw new ErroDireto(
        "A página do perfil veio sem o identificador que a busca precisa.",
      );
    }

    return { userId, total: extrairTotal(resposta.texto) };
  }

  /** Uma página do feed, com tentativas: 429 isolado não encerra a coleta. */
  async function buscarPagina(userId, maxId, sinal) {
    const url =
      `https://www.instagram.com/api/v1/feed/user/${userId}/` +
      `?count=${POR_PAGINA}${maxId ? `&max_id=${encodeURIComponent(maxId)}` : ""}`;

    let ultima = null;

    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      if (sinal?.aborted) break;

      try {
        const resposta = await buscarTexto(url);
        ultima = resposta.status;

        if (resposta.ok) {
          try {
            return JSON.parse(resposta.texto);
          } catch {
            ultima = 0;
          }
        }
      } catch {
        ultima = 0;
      }

      if (tentativa < TENTATIVAS) {
        aoProgresso?.({
          aviso: `O Instagram respondeu ${ultima}. Tentando de novo…`,
        });
        await esperar(2500 * tentativa, sinal);
      }
    }

    const erro = new ErroDireto(
      `O feed respondeu ${ultima ?? 0} depois de ${TENTATIVAS} tentativas` +
      `${csrf ? "" : ", e sem o token que a API exige"}.`,
    );
    console.warn("[Acervo] busca sem aba falhou:", erro.message);
    throw erro;
  }

  /**
   * @param {{ adaptador: object, handle: string, profileKey: string,
   *           teto?: number|null, sinal?: AbortSignal }} args
   */
  async function coletar({ adaptador, handle, profileKey, teto = null, sinal }) {
    const perfil = await identificar(handle);

    const estado = { seq: 0, indexados: 0, paginas: 0, completo: false, vistos: new Set() };
    let maxId = null;
    let semNovidade = 0;

    while (true) {
      if (sinal?.aborted) break;

      const json = await buscarPagina(perfil.userId, maxId, sinal);
      const pagina = adaptador.parsear(json);
      estado.paginas++;

      const novos = [];
      for (const bruto of pagina.itens) {
        const key = `${profileKey}#${bruto.id}`;
        if (estado.vistos.has(key)) continue;
        estado.vistos.add(key);
        novos.push({ ...bruto, key, profileKey, seq: ++estado.seq });
      }

      if (novos.length > 0) await repo.posts.salvarLote(novos);
      estado.indexados += novos.length;
      maxId = pagina.cursor ?? maxId;

      // Cursor travado devolve a mesma página para sempre; sem esta guarda o
      // laço nunca terminaria, porque a deduplicação impede o total de crescer.
      semNovidade = novos.length > 0 ? 0 : semNovidade + 1;
      estado.completo = !pagina.temMais || pagina.itens.length === 0 || semNovidade >= 2;

      await repo.perfis.salvar({
        key: profileKey,
        userId: perfil.userId,
        cursor: maxId,
        totalIndexado: estado.seq,
        totalDeclarado: perfil.total ?? null,
        completo: estado.completo,
        indexadoEm: Date.now(),
      });

      aoProgresso?.({
        indexados: estado.indexados,
        paginas: estado.paginas,
        total: perfil.total,
        semAba: true,
      });

      if (estado.completo || (teto != null && estado.indexados >= teto)) break;
      await esperar(esperaAleatoria(ESPERA_MIN_MS, ESPERA_MAX_MS, aleatorio), sinal);
    }

    return {
      indexados: estado.indexados,
      paginas: estado.paginas,
      completo: estado.completo,
      total: perfil.total,
      semAba: true,
    };
  }

  return { coletar, identificar };
}
