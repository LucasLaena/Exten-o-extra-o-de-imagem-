import {
  pingar, capturaInstalada, lerPerfilDaPagina, sondarInstagram, sondarFeed, IG_APP_ID,
} from "./sondas.js";
import {
  extrairIdDoPerfil, ehPrivado, extrairCsrf, extrairAppId,
} from "../core/perfil-html.js";

/**
 * Testa cada elo da corrente e diz qual quebrou, com o que fazer.
 *
 * Existe porque a versão anterior falhava em silêncio: o usuário clicava e
 * nada acontecia, sem nenhuma pista. Aqui cada passo devolve verde, vermelho
 * ou aviso, e o vermelho vem com instrução.
 */
export async function rodarDiagnostico({ executor, alvo, repo, buscar = fetch }) {
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

  // A busca direta é o caminho principal: se ela funciona, nem precisamos de
  // aba. Testá-la primeiro é o que separa "não deu" de "não deu por causa X".
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
          "Busca sem aba",
          "aviso",
          `a página do perfil respondeu ${resposta.status}. ` +
            "A coleta vai precisar abrir a aba do perfil.",
        );
      } else if (ehPrivado(html)) {
        registrar("Busca sem aba", "erro", "este perfil é privado; o Acervo só lê perfil público.");
      } else {
        const id = extrairIdDoPerfil(html, alvo.handle);
        if (!id) {
          registrar(
            "Busca sem aba",
            "aviso",
            `a página veio (${html.length} caracteres) mas sem o identificador do perfil. ` +
              "Provavelmente o Instagram devolveu a versão deslogada.",
          );
        } else {
          const csrf = extrairCsrf(html);
          const appId = extrairAppId(html) ?? IG_APP_ID;

          const feed = await buscar(
            `https://www.instagram.com/api/v1/feed/user/${id}/?count=50`,
            {
              credentials: "include",
              headers: {
                "x-ig-app-id": appId,
                "x-requested-with": "XMLHttpRequest",
                "x-ig-www-claim": "0",
                ...(csrf ? { "x-csrftoken": csrf } : {}),
              },
            },
          );
          const texto = await feed.text();
          let quantas = null;
          try {
            quantas = JSON.parse(texto)?.items?.length ?? null;
          } catch {}

          registrar(
            "Busca sem aba",
            feed.ok && quantas ? "ok" : "aviso",
            feed.ok && quantas
              ? `id ${id}, ${quantas} publicações numa requisição — não precisa de aba`
              : `id ${id}, token ${csrf ? "encontrado" : "AUSENTE"}, ` +
                `mas o feed respondeu ${feed.status}` +
                (texto.slice(0, 80) ? `: ${texto.slice(0, 80)}` : ""),
          );
        }
      }
    } catch (erro) {
      registrar("Busca sem aba", "erro", String(erro?.message ?? erro));
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
