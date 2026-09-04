// Content script clássico: não aceita `import`. Só carrega o módulo de verdade,
// que é web-accessible e pode usar ES modules à vontade.
//
// As linhas de log existem para diagnóstico: se o console da página não mostra
// nenhuma delas, o content script não chegou a rodar — problema de injeção, não
// de detecção de perfil.
(async () => {
  try {
    const { iniciar } = await import(chrome.runtime.getURL("src/content/app.js"));
    iniciar();
    console.log(
      "[Acervo] v" + chrome.runtime.getManifest().version + " ativo em",
      location.href,
    );
  } catch (erro) {
    // Recarregar a extensão invalida o contexto dos scripts já injetados. Não é
    // defeito: é o estado normal de um script órfão. Basta recarregar a página.
    if (/context invalidated/i.test(String(erro?.message ?? erro))) {
      console.info(
        "[Acervo] a extensão foi recarregada; recarregue esta página (F5) para usar de novo.",
      );
      return;
    }
    console.error("[Acervo] falhei ao iniciar:", erro);
  }
})();
