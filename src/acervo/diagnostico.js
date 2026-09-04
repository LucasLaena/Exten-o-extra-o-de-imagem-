import {
  pingar, capturaInstalada, lerPerfilDaPagina, sondarInstagram, IG_APP_ID,
} from "./sondas.js";

/**
 * Testa cada elo da corrente e diz qual quebrou, com o que fazer.
 *
 * Existe porque a versão anterior falhava em silêncio: o usuário clicava e
 * nada acontecia, sem nenhuma pista. Aqui cada passo devolve verde, vermelho
 * ou aviso, e o vermelho vem com instrução.
 */
export async function rodarDiagnostico({ executor, alvo, repo }) {
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
