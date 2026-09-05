import {
  pingar, capturaInstalada, lerPerfilDaPagina, sondarInstagram, sondarFeed, IG_APP_ID,
} from "./sondas.js";
import {
  extrairIdDoPerfil, ehPrivado, extrairCsrf, extrairAppId,
} from "../core/perfil-html.js";
import { abrirCanal } from "./canal.js";
import { criarAprendiz } from "./assinatura-aba.js";

/**
 * Testa cada elo da corrente e diz qual quebrou, com o que fazer.
 *
 * Existe porque a versão anterior falhava em silêncio: o usuário clicava e
 * nada acontecia, sem nenhuma pista. Aqui cada passo devolve verde, vermelho
 * ou aviso, e o vermelho vem com instrução.
 */
export async function rodarDiagnostico({
  executor, alvo, repo, buscar = fetch,
  abrir = abrirCanal, aprendiz = criarAprendiz,
}) {
  const passos = [];
  const registrar = (nome, estado, detalhe) => {
    passos.push({ nome, estado, detalhe });
    return estado === "ok";
  };

  if (!alvo?.ok) {
    registrar("Perfil informado", "erro", alvo?.erro ?? "Nenhum perfil escolhido.");
    return passos;
  }
  registrar("Perfil informado", "ok", `${alvo.profileKey} → ${alvo.urlDoPerfil}`);

  // A página do perfil é o que sustenta a coleta sem aba: dela saem o
  // identificador, o token e o total. O endpoint /api/v1/feed não é testado
  // aqui de propósito — ele é a API privada do aplicativo de celular e devolve
  // a página do site para qualquer requisição de navegador, então falhar ali
  // não diria nada sobre o caminho que a coleta usa de verdade.
  if (alvo.adaptador.id === "instagram") {
    try {
      const url = `https://www.instagram.com/${encodeURIComponent(alvo.handle)}/`;
      const resposta = await buscar(url, {
        credentials: "include",
        headers: { "x-ig-app-id": IG_APP_ID, "x-requested-with": "XMLHttpRequest" },
      });
      const html = await resposta.text();

      if (!resposta.ok) {
        registrar(
          "Leitura do perfil",
          "erro",
          `a página do perfil respondeu ${resposta.status}.` +
            (resposta.status === 429 ? " Espere alguns minutos e tente de novo." : ""),
        );
      } else if (ehPrivado(html)) {
        registrar("Leitura do perfil", "erro", "este perfil é privado; o Acervo só lê perfil público.");
      } else {
        const id = extrairIdDoPerfil(html, alvo.handle);
        if (!id) {
          registrar(
            "Leitura do perfil",
            "aviso",
            `a página veio (${html.length} caracteres) mas sem o identificador do perfil. ` +
              "Provavelmente o Instagram devolveu a versão deslogada.",
          );
        } else {
          const csrf = extrairCsrf(html);
          registrar(
            "Leitura do perfil",
            "ok",
            `id ${id}, token ${csrf ? "encontrado" : "ausente"} — ` +
              "a coleta aprende a consulta com uma passada rápida pela aba e " +
              "pagina o resto sem aba nenhuma",
          );
        }
      }
    } catch (erro) {
      registrar("Leitura do perfil", "erro", String(erro?.message ?? erro));
    }
  }

  let aba;
  try {
    aba = await executor.acharOuAbrirAba(alvo.urlDoPerfil);
    registrar(
      "Aba do perfil",
      "ok",
      aba.criada ? `aberta agora em segundo plano (id ${aba.abaId})` : `já estava aberta (id ${aba.abaId})`,
    );
  } catch (erro) {
    registrar("Aba do perfil", "erro", erro.message);
    return passos;
  }

  try {
    try {
      const pong = await executor.rodar(aba.abaId, pingar);
      if (pong !== "ok") throw new Error(`resposta inesperada: ${JSON.stringify(pong)}`);
      registrar("Executar código na aba", "ok", "o Chrome deixou rodar e devolveu resultado");
    } catch (erro) {
      registrar("Executar código na aba", "erro", erro.message);
      return passos;
    }

    try {
      const instalada = await executor.rodar(aba.abaId, capturaInstalada);
      registrar(
        "Script de captura ativo",
        instalada ? "ok" : "erro",
        instalada
          ? "a extensão está ativa nessa página"
          : "recarregue a aba do perfil com F5 — ela foi aberta antes da extensão",
      );
    } catch (erro) {
      registrar("Script de captura ativo", "erro", erro.message);
    }

    if (alvo.adaptador.id === "instagram") {
      try {
        // A página primeiro: não custa requisição e por isso não sofre 429.
        const daPagina = await executor.rodar(aba.abaId, lerPerfilDaPagina, [alvo.handle]);
        const perfil = daPagina?.ok
          ? { ...daPagina, status: 200 }
          : await executor.rodar(aba.abaId, sondarInstagram, [alvo.handle, IG_APP_ID]);
        if (perfil?.ok) {
          registrar(
            "Perfil encontrado no Instagram",
            perfil.privado ? "aviso" : "ok",
            perfil.privado
              ? `id ${perfil.userId}, mas é privado: só cataloga se você seguir`
              : `id ${perfil.userId}` +
                (perfil.total != null ? `, ${perfil.total} publicações` : "") +
                (perfil.fonte === "pagina" ? " (lido da própria página, sem consulta)" : ""),
          );
        } else {
          registrar(
            "Perfil encontrado no Instagram",
            "erro",
            perfil?.status === 429
              ? "o Instagram está limitando consultas (429). Espere alguns minutos. " +
                "Enquanto isso, role a grade do perfil: o id passa a ser lido da própria página."
              : `o Instagram respondeu ${perfil?.status ?? "nada"}. ` +
                "Confira se você está logado nessa aba.",
          );
        }
      } catch (erro) {
        registrar("Perfil encontrado no Instagram", "erro", erro.message);
      }

      // O endpoint de feed é o que separa um minuto de meia hora. Se ele
      // responder, a coleta é rápida; se não, sobra a rolagem.
      const idConhecido = passos.find((p) => p.nome === "Perfil encontrado no Instagram");
      const userId = idConhecido?.detalhe?.match(/id (d+)/)?.[1];

      if (userId) {
        try {
          const feed = await executor.rodar(aba.abaId, sondarFeed, [userId, IG_APP_ID, 50]);
          if (feed?.ok && feed.itens > 0) {
            registrar(
              "Feed rápido disponível",
              "ok",
              `${feed.itens} publicações numa requisição` +
                (feed.temMais ? ", e há mais páginas" : ", e esta é a última página"),
            );
          } else {
            registrar(
              "Feed rápido disponível",
              "aviso",
              `o endpoint respondeu ${feed?.status ?? 0}` +
                (feed?.mensagem ? `: ${feed.mensagem}` : "") +
                ". A coleta vai usar a rolagem, que funciona mas é bem mais lenta.",
            );
          }
        } catch (erro) {
          registrar("Feed rápido disponível", "aviso", erro.message);
        }
      }
    } else {
      registrar(
        "Coleta do TikTok",
        "aviso",
        "no TikTok o Acervo rola a página e recolhe o que o site carrega; " +
        "mantenha a aba aberta durante a indexação",
      );
    }
  } finally {
    await executor.fecharSeCriada(aba);
  }

  // A etapa que de fato vinha falhando, e que ate agora nenhum passo
  // testava: o diagnostico dava tudo verde e a indexacao morria em seguida.
  // Aprender a consulta e o unico elo que depende do formato do Instagram, e
  // por isso o unico que quebra sozinho quando eles mudam alguma coisa.
  if (alvo.adaptador.id === "instagram") {
    let canal = null;
    try {
      canal = await abrir({ executor, urlDoPerfil: alvo.urlDoPerfil });
      const { assinatura, pagina } = await aprendiz({ tentativas: 20 }).aprender({
        canal,
        adaptador: alvo.adaptador,
      });

      const endereco = String(assinatura.url).replace(/^https?:\/\/[^/]+/, "");
      registrar(
        "Consulta do feed",
        "ok",
        `aprendida em ${endereco} (cursor em ${assinatura.ondeVaiOCursor}), ` +
          `${pagina.itens.length} publicações na primeira página`,
      );
    } catch (erro) {
      registrar("Consulta do feed", "erro", String(erro?.message ?? erro));
    } finally {
      await canal?.fechar();
    }
  }

  try {
    const perfil = await repo.perfis.obter(alvo.profileKey);
    const total = perfil?.totalIndexado ?? 0;
    registrar(
      "Catálogo salvo",
      "ok",
      total > 0
        ? `${total} publicações já catalogadas${perfil?.completo ? ", completo" : ", incompleto"}`
        : "vazio — clique em Indexar perfil",
    );
  } catch (erro) {
    registrar("Catálogo salvo", "erro", erro.message);
  }

  return passos;
}
